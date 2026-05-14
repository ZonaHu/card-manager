// App factory. Pulled out of server/index.js so tests can build the same
// Express app against an in-memory SQLite database without binding a port.
//
// index.js is the production entrypoint; tests/server/setup.js builds its
// own app via this factory.

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const cookieParser = require('cookie-parser');

const { encrypt: encryptSecret, decrypt: decryptSecret } = require('./utils/crypto');
const { sendServerError, sendClientError } = require('./utils/errors');
const logger = require('./utils/logger');

const {
  CARD_CATEGORIES,
  smartCategorizeAccount
} = require('./lib/categorization');
const {
  plaidClient,
  REAUTH_ERROR_CODES,
  mapPlaidCategoryToUserFriendly,
  markCardsNeedReauth: _markCardsNeedReauthRaw,
  clearCardsReauth: _clearCardsReauthRaw,
  reconcileRemovedTransactions: _reconcileRemovedTransactionsRaw
} = require('./lib/plaid');
const {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTS,
  IS_PROD,
  authenticateToken,
  issueAuthCookie,
  authLimiter,
  apiLimiter,
  registerSchema,
  loginSchema,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTS,
  generateRefreshToken,
  issueRefreshCookie
} = require('./lib/auth');

const authRoutes = require('./routes/auth');
const preferenceRoutes = require('./routes/preferences');
const plaidRoutes = require('./routes/plaid');
const cardRoutes = require('./routes/cards');
const transactionRoutes = require('./routes/transactions');
const ruleRoutes = require('./routes/rules');
const { loadRules, applyRules } = require('./lib/categorizationRules');
const plaidItems = require('./lib/plaidItems');
const { loadSplitRules, findMatchingRule, applySplit } = require('./lib/splitRules');
const { verifyPlaidWebhook } = require('./lib/plaidWebhook');

function makeApp(db, opts = {}) {
  const { disableRateLimit = false } = opts;

  const app = express();
  const SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  // ----- Middleware -----
  app.use(helmet({
    contentSecurityPolicy: IS_PROD ? undefined : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
  }));
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || FRONTEND_URL).split(',').map(s => s.trim());
  app.use(cors({ origin: allowedOrigins, credentials: true }));

  // Bind db-aware Plaid helpers up-front so the webhook (mounted next) can
  // call them. These are also re-used by the route factories below.
  const markCardsNeedReauth = (ids, code) => _markCardsNeedReauthRaw(db, ids, code);
  const clearCardsReauth = (ids) => _clearCardsReauthRaw(db, ids);
  const reconcileRemovedTransactions = (userId, cardIds, startDate, endDate, returnedIds) =>
    _reconcileRemovedTransactionsRaw(db, userId, cardIds, startDate, endDate, returnedIds);

  // Plaid webhook MUST receive the raw body so the signature's
  // request_body_sha256 claim verifies. Mount it before the global JSON parser.
  app.post('/api/plaid/webhook',
    express.raw({ type: '*/*', limit: '100kb' }),
    async (req, res) => {
      const rawBody = req.body && Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
      const ok = await verifyPlaidWebhook(req, rawBody);
      if (!ok) return res.status(401).json({ error: 'Invalid webhook signature' });

      let body = {};
      try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { /* keep empty */ }
      const { webhook_type, webhook_code, item_id, error } = body;
      logger.info('plaid webhook', { webhook_type, webhook_code, item_id });

      try {
        if (webhook_type === 'ITEM' && error && REAUTH_ERROR_CODES.has(error.error_code)) {
          const rows = await new Promise((resolve, reject) => {
            db.all('SELECT id FROM cards WHERE item_id = ?', [item_id],
              (err, r) => err ? reject(err) : resolve(r));
          });
          await markCardsNeedReauth(rows.map(r => r.id), error.error_code);
        }
      } catch (e) {
        logger.error('plaid webhook handler failed', { err: e && e.message });
      }
      res.json({ ok: true });
    }
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: IS_PROD, sameSite: IS_PROD ? 'strict' : 'lax' }
  }));
  app.use(passport.initialize());
  app.use(passport.session());

  // Rate-limit is incompatible with high-volume tests (would 429 the suite).
  if (!disableRateLimit) {
    app.use('/api/', apiLimiter);
  }

  app.locals.db = db;

  // ----- Passport / Google OAuth -----
  // Configure even in tests so Passport doesn't blow up on a missing strategy.
  // GOOGLE_CLIENT_ID may be unset in tests — Strategy still constructs (we
  // just won't hit the route).
  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: '/api/auth/google/callback'
    }, (accessToken, refreshToken, profile, done) => {
      db.get('SELECT * FROM users WHERE google_id = ?', [profile.id], (err, user) => {
        if (err) return done(err);
        if (user) return done(null, user);
        db.get('SELECT * FROM users WHERE email = ?', [profile.emails[0].value], (err2, existingUser) => {
          if (err2) return done(err2);
          if (existingUser) {
            db.run('UPDATE users SET google_id = ? WHERE id = ?', [profile.id, existingUser.id], (err3) => {
              if (err3) return done(err3);
              existingUser.google_id = profile.id;
              return done(null, existingUser);
            });
          } else {
            db.run(
              'INSERT INTO users (name, email, google_id) VALUES (?, ?, ?)',
              [profile.displayName, profile.emails[0].value, profile.id],
              function (err4) {
                if (err4) return done(err4);
                db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err5, newUser) =>
                  err5 ? done(err5) : done(null, newUser));
              }
            );
          }
        });
      });
    }));
  }
  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser((id, done) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => done(err, user));
  });

  // ----- Routes -----
  const sharedDeps = {
    db, sendServerError, sendClientError, authenticateToken,
    CARD_CATEGORIES, smartCategorizeAccount, mapPlaidCategoryToUserFriendly,
    decryptSecret, encryptSecret, plaidClient
  };

  app.use('/api/auth', authRoutes({
    ...sharedDeps,
    passport,
    FRONTEND_URL,
    issueAuthCookie,
    authLimiter: disableRateLimit ? ((req, res, next) => next()) : authLimiter,
    registerSchema,
    loginSchema,
    AUTH_COOKIE_NAME,
    AUTH_COOKIE_OPTS,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_OPTS,
    generateRefreshToken,
    issueRefreshCookie
  }));

  app.use('/api/user', preferenceRoutes(sharedDeps));

  app.use('/api/plaid', plaidRoutes({
    ...sharedDeps,
    REAUTH_ERROR_CODES,
    markCardsNeedReauth,
    clearCardsReauth,
    reconcileRemovedTransactions,
    loadRules,
    applyRules,
    loadSplitRules,
    findMatchingRule,
    applySplit,
    plaidItems
  }));

  app.use('/', cardRoutes(sharedDeps));
  app.use('/api/transactions', transactionRoutes(sharedDeps));
  app.use('/api/categorization-rules', ruleRoutes(sharedDeps));

  app.get('/health', (req, res) => {
    db.get('SELECT 1 AS ok', [], (err) => {
      if (err) return res.status(500).json({ status: 'error', db: 'down' });
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  });

  return app;
}

module.exports = { makeApp };
