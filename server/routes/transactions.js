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
    let where = 'WHERE user_id = ?';
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
    if (!cardId || !amount || !description || !category || !date) {
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

    const { amount, description, category } = req.body;
    if (!amount || !description || !category) {
      return res.status(400).json({ error: 'Amount, description, and category are required' });
    }

    db.run(
      'UPDATE transactions SET amount = ?, description = ?, category = ? WHERE id = ? AND user_id = ?',
      [amount, description, category, transactionId, req.user.userId],
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

  return router;
};
