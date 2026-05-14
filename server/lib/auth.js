const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required. Set it in server/.env before starting the server.');
}

const IS_PROD = process.env.NODE_ENV === 'production';
const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'strict' : 'lax',
  maxAge: 24 * 60 * 60 * 1000
};

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: IS_PROD ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
};

// Prefers httpOnly cookie, falls back to Authorization header for
// backwards-compat during client migration. After verifying the JWT signature
// we also confirm the `tv` (token_version) claim matches what's in the users
// table — bumping users.token_version (on logout, password change, etc.)
// instantly invalidates every previously-issued JWT for that user.
function authenticateToken(req, res, next) {
  const cookieToken = req.cookies && req.cookies[AUTH_COOKIE_NAME];
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    const db = req.app && req.app.locals && req.app.locals.db;
    if (!db || typeof user.tv !== 'number') {
      // No db wired or legacy token without tv → fall back to signature-only.
      req.user = user;
      return next();
    }
    db.get('SELECT token_version FROM users WHERE id = ?', [user.userId], (dbErr, row) => {
      if (dbErr) return res.status(500).json({ error: 'Server error' });
      if (!row || row.token_version !== user.tv) {
        return res.status(401).json({ error: 'Session invalidated' });
      }
      req.user = user;
      next();
    });
  });
}

function issueAuthCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
  res.cookie(AUTH_COOKIE_NAME, token, { ...AUTH_COOKIE_OPTS, maxAge: 15 * 60 * 1000 });
  return token;
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('hex');
}

function issueRefreshCookie(res, value) {
  res.cookie(REFRESH_COOKIE_NAME, value, REFRESH_COOKIE_OPTS);
}

// Aggressive limiter for endpoints attackers love.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded.' }
});

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name too long'),
  email: z.string().trim().toLowerCase().email('Invalid email').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200)
});
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email').max(254),
  password: z.string().min(1, 'Password required').max(200)
});

module.exports = {
  JWT_SECRET,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_OPTS,
  IS_PROD,
  authenticateToken,
  issueAuthCookie,
  authLimiter,
  apiLimiter,
  registerSchema,
  loginSchema,
  ACCESS_TOKEN_TTL,
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_OPTS,
  generateRefreshToken,
  issueRefreshCookie
};
