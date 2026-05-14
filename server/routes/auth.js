const express = require('express');
const bcrypt = require('bcryptjs');

// 10 rounds is sufficient for low-stakes; 12 is standard for credentials guarding
// financial data. Cost is ~4× slower (still sub-100ms) and no user-facing change.
const BCRYPT_ROUNDS = process.env.NODE_ENV === 'production' ? 12 : 10;

// All paths in this router are mounted under /api/auth by the parent app.
// Includes local email/password flows, cookie logout, /me, and the Google OAuth dance.
module.exports = function makeAuthRoutes(deps) {
  const {
    db,
    passport,
    FRONTEND_URL,
    sendServerError,
    sendClientError,
    authenticateToken,
    issueAuthCookie,
    authLimiter,
    registerSchema,
    loginSchema,
    AUTH_COOKIE_NAME,
    AUTH_COOKIE_OPTS,
    REFRESH_COOKIE_NAME,
    REFRESH_COOKIE_OPTS,
    generateRefreshToken,
    issueRefreshCookie
  } = deps;

  const router = express.Router();

  function persistRefresh(userId) {
    const token = generateRefreshToken();
    const exp = new Date(Date.now() + REFRESH_COOKIE_OPTS.maxAge).toISOString();
    return new Promise((resolve) => {
      db.run('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [userId, token, exp],
        () => resolve(token)  // best-effort; refresh-issuance failure shouldn't block login
      );
    });
  }

  router.post('/register', authLimiter, async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendClientError(res, parsed.error.issues[0]?.message || 'Invalid input');
      }
      const { name, email, password } = parsed.data;

      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      db.run(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [name, email, hashedPassword],
        async function (err) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return sendClientError(res, 'Email already exists');
            }
            return sendServerError(res, err);
          }
          // Newly-inserted user gets token_version = 1 by schema default.
          const userId = this.lastID;
          const token = issueAuthCookie(res, { userId, email, name, tv: 1 });
          const refresh = await persistRefresh(userId);
          issueRefreshCookie(res, refresh);
          res.status(201).json({
            message: 'User created successfully',
            token,
            user: { id: userId, name, email }
          });
        }
      );
    } catch (error) {
      sendServerError(res, error);
    }
  });

  router.post('/login', authLimiter, (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendClientError(res, parsed.error.issues[0]?.message || 'Invalid input');
      }
      const { email, password } = parsed.data;

      db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return sendServerError(res, err);
        if (!user) return sendClientError(res, 'Invalid credentials', 401);

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return sendClientError(res, 'Invalid credentials', 401);

        const tv = typeof user.token_version === 'number' ? user.token_version : 1;
        const token = issueAuthCookie(res, { userId: user.id, email: user.email, name: user.name, tv });
        const refresh = await persistRefresh(user.id);
        issueRefreshCookie(res, refresh);
        res.json({
          message: 'Login successful',
          token,
          user: { id: user.id, name: user.name, email: user.email }
        });
      });
    } catch (error) {
      sendServerError(res, error);
    }
  });

  router.post('/refresh', (req, res) => {
    const presented = req.cookies && req.cookies[REFRESH_COOKIE_NAME];
    if (!presented) return res.status(401).json({ error: 'No refresh token' });
    db.get(
      `SELECT rt.id AS rt_id, rt.user_id, rt.expires_at, rt.revoked_at,
              u.email, u.name, u.token_version
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token = ?`,
      [presented],
      (err, row) => {
        if (err) return sendServerError(res, err);
        if (!row || row.revoked_at || new Date(row.expires_at) <= new Date()) {
          return res.status(401).json({ error: 'Invalid refresh token' });
        }
        // Atomic revoke: only this caller wins because the WHERE clause requires
        // the row still be live. Two concurrent /refresh calls with the same
        // cookie now produce exactly one new token instead of racing to two.
        db.run(
          'UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND revoked_at IS NULL',
          [row.rt_id],
          function (revokeErr) {
            if (revokeErr) return sendServerError(res, revokeErr);
            if (this.changes !== 1) {
              return res.status(401).json({ error: 'Invalid refresh token' });
            }
            const newRefresh = generateRefreshToken();
            const exp = new Date(Date.now() + REFRESH_COOKIE_OPTS.maxAge).toISOString();
            db.run(
              'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
              [row.user_id, newRefresh, exp],
              (insertErr) => {
                if (insertErr) return sendServerError(res, insertErr);
                issueRefreshCookie(res, newRefresh);
                const token = issueAuthCookie(res, {
                  userId: row.user_id, email: row.email, name: row.name, tv: row.token_version
                });
                res.json({ token, user: { id: row.user_id, email: row.email, name: row.name } });
              }
            );
          }
        );
      }
    );
  });

  // Logout clears the cookie AND bumps the user's token_version so any other
  // copies of the JWT (other tabs, stolen tokens) stop validating immediately.
  // Authenticated so we know which user to invalidate; an unauth call would
  // just clear the local cookie which is what an attacker wants anyway.
  router.post('/logout', authenticateToken, (req, res) => {
    db.run(
      'UPDATE users SET token_version = COALESCE(token_version, 1) + 1 WHERE id = ?',
      [req.user.userId],
      (err) => {
        if (err) return sendServerError(res, err);
        const presented = req.cookies && req.cookies[REFRESH_COOKIE_NAME];
        if (presented) {
          db.run('UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token = ?', [presented]);
        }
        res.clearCookie(REFRESH_COOKIE_NAME, { ...REFRESH_COOKIE_OPTS, maxAge: undefined });
        res.clearCookie(AUTH_COOKIE_NAME, { ...AUTH_COOKIE_OPTS, maxAge: undefined });
        res.json({ message: 'Logged out' });
      }
    );
  });

  router.get('/me', authenticateToken, (req, res) => {
    res.json({ user: { id: req.user.userId, name: req.user.name, email: req.user.email } });
  });

  router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
  );

  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/?auth=failed` }),
    async (req, res) => {
      // Issue the auth token as an httpOnly cookie and redirect to a clean URL.
      // Avoids leaking the JWT via browser history, referer headers, or proxy logs.
      const tv = typeof req.user.token_version === 'number' ? req.user.token_version : 1;
      issueAuthCookie(res, { userId: req.user.id, email: req.user.email, name: req.user.name, tv });
      const refresh = await persistRefresh(req.user.id);
      issueRefreshCookie(res, refresh);
      res.redirect(`${FRONTEND_URL}/?auth=ok`);
    }
  );

  return router;
};
