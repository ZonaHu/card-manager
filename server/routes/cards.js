const express = require('express');
const logger = require('../utils/logger');

async function runRecategorize({ db, plaidClient, decryptSecret, mapPlaidCategoryToUserFriendly }, userId) {
  const transactions = await new Promise((resolve, reject) => {
    db.all(`
      SELECT t.*, c.plaid_id, c.access_token, c.item_id
      FROM transactions t
      JOIN cards c ON t.card_id = c.id
      WHERE t.user_id = ? AND t.source = 'plaid' AND t.plaid_transaction_id IS NOT NULL
    `, [userId], (err, rows) => err ? reject(err) : resolve(rows));
  });

  transactions.forEach(t => { t.access_token = decryptSecret(t.access_token); });

  const transactionsByToken = {};
  transactions.forEach(t => {
    (transactionsByToken[t.access_token] = transactionsByToken[t.access_token] || []).push(t);
  });

  let updatedCount = 0;
  for (const [accessToken, txnGroup] of Object.entries(transactionsByToken)) {
    try {
      const r = await plaidClient.transactionsGet({
        access_token: accessToken,
        start_date: '2023-01-01',
        end_date: new Date().toISOString().split('T')[0]
      });
      const plaidTxns = r.data.transactions;
      for (const dbTxn of txnGroup) {
        const p = plaidTxns.find(pt => pt.transaction_id === dbTxn.plaid_transaction_id);
        if (!p) continue;
        const newCategory = mapPlaidCategoryToUserFriendly(p);
        await new Promise((resolve, reject) => {
          db.run('UPDATE transactions SET category = ? WHERE id = ?',
            [newCategory, dbTxn.id], err => err ? reject(err) : resolve());
        });
        updatedCount++;
      }
    } catch (error) {
      // Per-token failure shouldn't block sibling tokens. Already logged by
      // the route handler; here we swallow so the sync flow keeps moving.
    }
  }

  return updatedCount;
}

// Mounted at /. Hosts both /api/cards/* (CRUD + recategorize) and /api/card-categories.
module.exports = function makeCardRoutes(deps) {
  const {
    db,
    authenticateToken,
    sendServerError,
    smartCategorizeAccount,
    mapPlaidCategoryToUserFriendly,
    decryptSecret,
    plaidClient,
    CARD_CATEGORIES
  } = deps;

  const router = express.Router();

  router.get('/api/card-categories', (req, res) => {
    res.json(CARD_CATEGORIES);
  });

  // Pulls fresh transactions from Plaid and updates the category column on each
  // local row that already had a plaid_transaction_id. Useful after we ship
  // category-mapping changes — lets the user retroactively apply the new logic.
  router.post('/api/transactions/recategorize', authenticateToken, async (req, res) => {
    try {
      const updatedCount = await runRecategorize(deps, req.user.userId);
      res.json({ success: true, message: `Successfully recategorized ${updatedCount} transactions`, updatedCount });
    } catch (error) {
      sendServerError(res, error, 'Failed to recategorize transactions');
    }
  });

  router.post('/api/cards/recategorize', authenticateToken, async (req, res) => {
    try {
      const cards = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM cards WHERE user_id = ?', [req.user.userId],
          (err, rows) => err ? reject(err) : resolve(rows));
      });

      let updatedCount = 0;
      const results = [];
      for (const card of cards) {
        const newCategory = smartCategorizeAccount(card.name, card.institution_name, card.type, card.account_subtype);
        if (card.category !== newCategory) {
          await new Promise((resolve, reject) => {
            db.run('UPDATE cards SET category = ? WHERE id = ?',
              [newCategory, card.id],
              err => err ? reject(err) : resolve());
          });
          updatedCount++;
          results.push({
            id: card.id, name: card.name, oldCategory: card.category, newCategory,
            categoryInfo: CARD_CATEGORIES[newCategory] || CARD_CATEGORIES.other
          });
        }
      }

      res.json({
        message: 'Card re-categorization completed',
        totalCards: cards.length,
        updatedCards: updatedCount,
        changes: results
      });
    } catch (error) {
      sendServerError(res, error, 'Failed to re-categorize cards');
    }
  });

  router.get('/api/cards', authenticateToken, (req, res) => {
    db.all('SELECT * FROM cards WHERE user_id = ?', [req.user.userId], (err, cards) => {
      if (err) return sendServerError(res, err);
      const enhanced = cards.map(card => {
        const { access_token, ...safe } = card;
        return {
          ...safe,
          needs_reauth: !!card.needs_reauth,
          categoryInfo: CARD_CATEGORIES[card.category] || CARD_CATEGORIES.other
        };
      });
      res.json(enhanced);
    });
  });

  router.post('/api/cards', authenticateToken, (req, res) => {
    const { name, type, lastFour, balance, currency, category } = req.body;
    if (!name || !type || !lastFour || balance === undefined) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    const finalCategory = (!category || category === 'other')
      ? smartCategorizeAccount(name, '', '', '')
      : category;
    const validCategory = finalCategory && CARD_CATEGORIES[finalCategory] ? finalCategory : 'other';

    db.run(
      'INSERT INTO cards (user_id, name, type, last_four, balance, currency, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.userId, name, type, lastFour, balance, currency || 'USD', validCategory],
      function (err) {
        if (err) return sendServerError(res, err);
        db.get('SELECT * FROM cards WHERE id = ?', [this.lastID], (err2, card) => {
          if (err2) return sendServerError(res, err2);
          res.status(201).json({
            ...card,
            categoryInfo: CARD_CATEGORIES[card.category] || CARD_CATEGORIES.other
          });
        });
      }
    );
  });

  router.delete('/api/cards/:id', authenticateToken, (req, res) => {
    const cardId = parseInt(req.params.id, 10);
    if (Number.isNaN(cardId)) return res.status(400).json({ error: 'Invalid card id' });

    db.run('DELETE FROM cards WHERE id = ? AND user_id = ?',
      [cardId, req.user.userId],
      function (err) {
        if (err) return sendServerError(res, err);
        if (this.changes === 0) return res.status(404).json({ error: 'Card not found' });

        // Transactions are CASCADE-deleted by the FK, but keep this for the
        // small fraction of rows inserted before the FK was enabled.
        db.run('DELETE FROM transactions WHERE card_id = ?', [cardId], delErr => {
          if (delErr) logger.error('error deleting transactions', { err: delErr.message });
        });

        res.json({ message: 'Card deleted successfully' });
      }
    );
  });

  return router;
};
module.exports.runRecategorize = runRecategorize;
