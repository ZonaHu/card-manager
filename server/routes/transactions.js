const express = require('express');

// Mounted at /api/transactions
module.exports = function makeTransactionRoutes(deps) {
  const { db, authenticateToken, sendServerError } = deps;
  const router = express.Router();

  // Paginated transactions. Supports filtering by month (YYYY-MM) and a hard limit
  // so the dashboard doesn't pull the entire history on every load.
  //   GET /api/transactions?month=2026-04
  //   GET /api/transactions?limit=500&offset=0
  router.get('/', authenticateToken, (req, res) => {
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : null;
    const limitRaw = parseInt(req.query.limit, 10);
    const offsetRaw = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 5000;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const params = [req.user.userId];
    let where = 'WHERE user_id = ? AND deleted_at IS NULL';
    if (month) {
      where += ' AND date >= ? AND date < ?';
      const [y, m] = month.split('-').map(Number);
      const start = `${y}-${String(m).padStart(2, '0')}-01`;
      const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
      params.push(start, nextMonth);
    }
    params.push(limit, offset);

    db.all(
      `SELECT * FROM transactions ${where} ORDER BY date DESC LIMIT ? OFFSET ?`,
      params,
      (err, transactions) => {
        if (err) return sendServerError(res, err);
        res.json(transactions);
      }
    );
  });

  router.post('/', authenticateToken, (req, res) => {
    const { cardId, amount, description, category, date } = req.body;
    // amount=0 is a valid (if unusual) input — guard explicitly instead of
    // using `!amount`, which falsey-rejects 0 and produces a misleading
    // "All fields are required" error.
    if (!cardId || amount === undefined || amount === null || !description || !category || !date) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Verify the card belongs to the user before letting them attach a txn to it.
    db.get('SELECT id FROM cards WHERE id = ? AND user_id = ?',
      [cardId, req.user.userId],
      (err, card) => {
        if (err) return sendServerError(res, err);
        if (!card) return res.status(404).json({ error: 'Card not found' });

        db.run(
          'INSERT INTO transactions (user_id, card_id, amount, description, category, date) VALUES (?, ?, ?, ?, ?, ?)',
          [req.user.userId, cardId, amount, description, category, date],
          function (insertErr) {
            if (insertErr) return sendServerError(res, insertErr);
            db.get('SELECT * FROM transactions WHERE id = ?', [this.lastID],
              (getErr, transaction) => {
                if (getErr) return sendServerError(res, getErr);
                res.status(201).json(transaction);
              });
          }
        );
      }
    );
  });

  // Link or unlink a positive transaction to the purchase it reimburses.
  //   POST /api/transactions/123/reimburses  body: { purchaseId: 456 }   → link
  //   POST /api/transactions/123/reimburses  body: { purchaseId: null }  → unlink
  //
  // Requires: reimbursement is positive, target is negative, both belong to the
  // same user, no self-link. Returns the updated reimbursement row.
  router.post('/:id/reimburses', authenticateToken, (req, res) => {
    const reimbursementId = parseInt(req.params.id, 10);
    if (Number.isNaN(reimbursementId)) return res.status(400).json({ error: 'Invalid transaction id' });
    const { purchaseId } = req.body || {};

    if (purchaseId === null || purchaseId === undefined) {
      db.run(
        'UPDATE transactions SET reimburses_id = NULL WHERE id = ? AND user_id = ?',
        [reimbursementId, req.user.userId],
        function (err) {
          if (err) return sendServerError(res, err);
          if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
          db.get('SELECT * FROM transactions WHERE id = ?', [reimbursementId],
            (e, row) => e ? sendServerError(res, e) : res.json(row));
        }
      );
      return;
    }

    const pid = parseInt(purchaseId, 10);
    if (Number.isNaN(pid) || pid === reimbursementId) {
      return res.status(400).json({ error: 'Invalid purchase id' });
    }

    db.all(
      'SELECT id, amount FROM transactions WHERE id IN (?, ?) AND user_id = ?',
      [reimbursementId, pid, req.user.userId],
      (err, rows) => {
        if (err) return sendServerError(res, err);
        if (rows.length !== 2) return res.status(404).json({ error: 'Transaction not found' });
        const reimb = rows.find(r => r.id === reimbursementId);
        const purchase = rows.find(r => r.id === pid);
        if (!reimb || reimb.amount <= 0) {
          return res.status(400).json({ error: 'Reimbursement must be a positive transaction' });
        }
        if (!purchase || purchase.amount >= 0) {
          return res.status(400).json({ error: 'Target must be a purchase (negative amount)' });
        }
        db.run(
          'UPDATE transactions SET reimburses_id = ? WHERE id = ? AND user_id = ?',
          [pid, reimbursementId, req.user.userId],
          function (upErr) {
            if (upErr) return sendServerError(res, upErr);
            db.get('SELECT * FROM transactions WHERE id = ?', [reimbursementId],
              (gErr, row) => gErr ? sendServerError(res, gErr) : res.json(row));
          }
        );
      }
    );
  });

  router.put('/:id', authenticateToken, (req, res) => {
    const transactionId = parseInt(req.params.id, 10);
    if (Number.isNaN(transactionId)) return res.status(400).json({ error: 'Invalid transaction id' });

    const { amount, description, category, notes } = req.body;
    if (!amount || !description || !category) {
      return res.status(400).json({ error: 'Amount, description, and category are required' });
    }

    // Cap notes at a sane length — protects DB rows from accidental megabyte
    // pastes and bounds row size for the dashboard query.
    const safeNotes =
      notes === undefined || notes === null ? null :
      typeof notes === 'string' ? notes.slice(0, 2000) : null;

    db.run(
      'UPDATE transactions SET amount = ?, description = ?, category = ?, notes = ? WHERE id = ? AND user_id = ?',
      [amount, description, category, safeNotes, transactionId, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });

        db.get('SELECT * FROM transactions WHERE id = ?', [transactionId], (err2, updated) => {
          if (err2) return sendServerError(res, err2);
          res.json(updated);
        });
      }
    );
  });

  // Soft-delete: stamp deleted_at instead of dropping the row, so the user
  // can undo within the UI window. The reimbursement-pointer scrub trigger
  // (migration 015) doesn't fire on soft delete — and that's deliberate;
  // the linked reimbursement keeps working until the user actually purges.
  router.delete('/:id', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid transaction id' });
    db.run(
      `UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      [id, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
        res.json({ ok: true, id });
      }
    );
  });

  // Restore endpoint — flips deleted_at back to NULL. Only the owner can
  // restore their own row.
  router.post('/:id/restore', authenticateToken, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid transaction id' });
    db.run(
      'UPDATE transactions SET deleted_at = NULL WHERE id = ? AND user_id = ?',
      [id, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        if (this.changes === 0) return res.status(404).json({ error: 'Transaction not found' });
        db.get('SELECT * FROM transactions WHERE id = ?', [id],
          (e, row) => e ? sendServerError(res, e) : res.json(row));
      }
    );
  });

  router.get('/balance-snapshots', authenticateToken, (req, res) => {
    const sinceRaw = typeof req.query.since === 'string' ? req.query.since : '';
    const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw)
      ? sinceRaw
      : new Date(Date.now() - 365 * 86_400_000).toISOString().split('T')[0];
    const balanceSnapshots = require('../lib/balanceSnapshots');
    balanceSnapshots.loadSnapshots(db, req.user.userId, since)
      .then(rows => res.json(rows))
      .catch(err => sendServerError(res, err));
  });

  // Bulk category update. Body: { ids: number[], category: string }. Limits
  // to 500 ids per call so a runaway client can't lock the DB; the dashboard
  // never selects that many in a single action.
  router.post('/batch-recategorize', authenticateToken, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Number.isFinite) : null;
    const category = typeof req.body?.category === 'string' ? req.body.category.trim() : '';
    if (!ids || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
    if (ids.length > 500) return res.status(400).json({ error: 'too many ids (max 500)' });
    if (!category) return res.status(400).json({ error: 'category is required' });

    const placeholders = ids.map(() => '?').join(',');
    db.run(
      `UPDATE transactions SET category = ? WHERE id IN (${placeholders}) AND user_id = ? AND deleted_at IS NULL`,
      [category, ...ids, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        res.json({ ok: true, updated: this.changes });
      }
    );
  });

  return router;
};
