const express = require('express');

// Mounted at /api/categorization-rules.
module.exports = function makeRuleRoutes(deps) {
  const { db, authenticateToken, sendServerError, sendClientError } = deps;
  const router = express.Router();

  router.get('/', authenticateToken, (req, res) => {
    db.all(
      'SELECT id, pattern, category, created_at FROM categorization_rules WHERE user_id = ? ORDER BY id',
      [req.user.userId],
      (err, rows) => {
        if (err) return sendServerError(res, err);
        res.json(rows || []);
      }
    );
  });

  router.post('/', authenticateToken, (req, res) => {
    const pattern = typeof req.body?.pattern === 'string' ? req.body.pattern.trim() : '';
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    if (!pattern) return sendClientError(res, 'pattern is required');
    if (!category) return sendClientError(res, 'category is required');
    // A 1-2 char substring match against transaction descriptions would
    // catch nearly every row (e.g. "a" matches "Amex", "Coffee", anything
    // with an a). Reject so users don't accidentally retag their whole feed.
    if (pattern.length < 3) return sendClientError(res, 'pattern must be at least 3 characters');
    if (pattern.length > 200) return sendClientError(res, 'pattern too long');

    db.run(
      'INSERT INTO categorization_rules (user_id, pattern, category) VALUES (?, ?, ?)',
      [req.user.userId, pattern, category],
      function (err) {
        if (err) return sendServerError(res, err);
        res.status(201).json({ id: this.lastID, pattern, category });
      }
    );
  });

  router.delete('/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendClientError(res, 'Invalid rule id');
    db.run(
      'DELETE FROM categorization_rules WHERE id = ? AND user_id = ?',
      [id, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        if (this.changes === 0) return res.status(404).json({ error: 'Rule not found' });
        res.json({ message: 'Rule deleted' });
      }
    );
  });

  // --- Split rules (sub-route under /api/categorization-rules/split). One
  // table per rule type; we expose them via parallel endpoints to keep the
  // frontend's mental model simple ("rules that apply on sync").

  router.get('/split/list', authenticateToken, (req, res) => {
    db.all(
      `SELECT id, card_id, pattern, threshold, split_amount, split_category, split_description, created_at
       FROM split_rules WHERE user_id = ? ORDER BY id`,
      [req.user.userId],
      (err, rows) => {
        if (err) return sendServerError(res, err);
        res.json(rows || []);
      }
    );
  });

  router.post('/split/list', authenticateToken, (req, res) => {
    const b = req.body || {};
    const pattern = typeof b.pattern === 'string' ? b.pattern.trim() : '';
    const split_category = typeof b.split_category === 'string' ? b.split_category.trim() : '';
    const split_description = typeof b.split_description === 'string' ? b.split_description.trim() : 'Split sibling';
    const threshold = Number(b.threshold);
    const split_amount = Number(b.split_amount);
    const card_id = b.card_id == null || b.card_id === '' ? null : Number(b.card_id);

    if (!pattern) return sendClientError(res, 'pattern is required');
    if (pattern.length < 3) return sendClientError(res, 'pattern must be at least 3 characters');
    if (!split_category) return sendClientError(res, 'split_category is required');
    if (!Number.isFinite(threshold) || threshold <= 0) return sendClientError(res, 'threshold must be > 0');
    if (!Number.isFinite(split_amount) || split_amount <= 0) return sendClientError(res, 'split_amount must be > 0');

    db.run(
      `INSERT INTO split_rules (user_id, card_id, pattern, threshold, split_amount, split_category, split_description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.userId, card_id, pattern, threshold, split_amount, split_category, split_description],
      function (err) {
        if (err) return sendServerError(res, err);
        res.status(201).json({ id: this.lastID, card_id, pattern, threshold, split_amount, split_category, split_description });
      }
    );
  });

  router.delete('/split/list/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return sendClientError(res, 'Invalid rule id');
    db.run(
      'DELETE FROM split_rules WHERE id = ? AND user_id = ?',
      [id, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        if (this.changes === 0) return res.status(404).json({ error: 'Rule not found' });
        res.json({ message: 'Rule deleted' });
      }
    );
  });

  return router;
};
