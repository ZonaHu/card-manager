const express = require('express');

// Mounted at /api/user
module.exports = function makePreferenceRoutes(deps) {
  const { db, authenticateToken, sendServerError, sendClientError } = deps;
  const router = express.Router();

  // Currencies / countries we actually support. The frontend uses these to
  // pick the right Plaid country_codes list at link-token time; anything else
  // silently fell back to US which produced surprising results for non-CA
  // non-US users. Reject unknowns explicitly so the user gets feedback.
  const ALLOWED_COUNTRIES = new Set(['US', 'CA']);
  const ALLOWED_CURRENCIES = new Set(['USD', 'CAD']);

  router.post('/preferences', authenticateToken, (req, res) => {
    const { country, currency } = req.body;
    if (!country || !currency) {
      return res.status(400).json({ error: 'Country and currency are required' });
    }
    if (!ALLOWED_COUNTRIES.has(country)) {
      return sendClientError(res, `country must be one of: ${Array.from(ALLOWED_COUNTRIES).join(', ')}`);
    }
    if (!ALLOWED_CURRENCIES.has(currency)) {
      return sendClientError(res, `currency must be one of: ${Array.from(ALLOWED_CURRENCIES).join(', ')}`);
    }
    db.run(
      'UPDATE users SET country = ?, preferred_currency = ? WHERE id = ?',
      [country, currency, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        res.json({ message: 'Preferences updated successfully' });
      }
    );
  });

  router.get('/preferences', authenticateToken, (req, res) => {
    db.get(
      'SELECT country, preferred_currency FROM users WHERE id = ?',
      [req.user.userId],
      (err, user) => {
        if (err) return sendServerError(res, err, 'Failed to load preferences');
        if (!user) return res.json({ country: 'US', currency: 'USD' });
        res.json({
          country: user.country || 'US',
          currency: user.preferred_currency || 'USD'
        });
      }
    );
  });

  // Per-category monthly budgets. Stored as a JSON blob on the user row:
  //   { "Food": 500, "Transport": 150 }
  // Negative or non-finite values are rejected. Empty body clears the budget.
  router.get('/budget', authenticateToken, (req, res) => {
    db.get('SELECT budget_config FROM users WHERE id = ?', [req.user.userId], (err, row) => {
      if (err) return sendServerError(res, err);
      if (!row || !row.budget_config) return res.json({ budget: {} });
      try {
        res.json({ budget: JSON.parse(row.budget_config) });
      } catch {
        res.json({ budget: {} });
      }
    });
  });

  router.post('/budget', authenticateToken, (req, res) => {
    const body = req.body && req.body.budget;
    if (body !== null && (typeof body !== 'object' || Array.isArray(body))) {
      return sendClientError(res, 'budget must be an object keyed by category');
    }
    const sanitized = {};
    if (body) {
      for (const [k, v] of Object.entries(body)) {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) {
          return sendClientError(res, `Invalid amount for category "${k}"`);
        }
        if (n > 0) sanitized[k] = Math.round(n * 100) / 100;
      }
    }
    const value = Object.keys(sanitized).length ? JSON.stringify(sanitized) : null;
    db.run('UPDATE users SET budget_config = ? WHERE id = ?', [value, req.user.userId], (err) => {
      if (err) return sendServerError(res, err);
      res.json({ budget: sanitized });
    });
  });

  return router;
};
