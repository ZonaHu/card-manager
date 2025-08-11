const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { mapPlaidCategoryToUserFriendly } = require('../config/categories');

const router = express.Router();

// Database will be injected when routes are setup
let db;

const setupRoutes = (database) => {
  db = database;
  return router;
};

// GET /api/transactions
router.get('/', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC, id DESC',
    [req.user.userId],
    (err, transactions) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }
      res.json(transactions);
    }
  );
});

// POST /api/transactions
router.post('/', authenticateToken, (req, res) => {
  const { cardId, amount, description, category, date } = req.body;

  if (!cardId || !amount || !description || !category || !date) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Verify the card belongs to the user
  db.get('SELECT * FROM cards WHERE id = ? AND user_id = ?', [cardId, req.user.userId], (err, card) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    db.run(
      'INSERT INTO transactions (user_id, card_id, amount, description, category, date) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.userId, cardId, amount, description, category, date],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Server error' });
        }

        db.get('SELECT * FROM transactions WHERE id = ?', [this.lastID], (err, transaction) => {
          if (err) {
            return res.status(500).json({ error: 'Server error' });
          }
          res.status(201).json(transaction);
        });
      }
    );
  });
});

// PUT /api/transactions/:id
router.put('/:id', authenticateToken, (req, res) => {
  console.log(`PUT /api/transactions/${req.params.id} called by user ${req.user.userId}`);
  const transactionId = req.params.id;
  const { amount, description, category } = req.body;

  if (!amount || !description || !category) {
    return res.status(400).json({ error: 'Amount, description, and category are required' });
  }

  // First verify the transaction belongs to the user
  db.get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [transactionId, req.user.userId], (err, transaction) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update the transaction
    db.run(
      'UPDATE transactions SET amount = ?, description = ?, category = ? WHERE id = ? AND user_id = ?',
      [amount, description, category, transactionId, req.user.userId],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Server error' });
        }

        if (this.changes === 0) {
          return res.status(404).json({ error: 'Transaction not found' });
        }

        // Return the updated transaction
        db.get('SELECT * FROM transactions WHERE id = ?', [transactionId], (err, updatedTransaction) => {
          if (err) {
            return res.status(500).json({ error: 'Server error' });
          }
          res.json(updatedTransaction);
        });
      }
    );
  });
});

// POST /api/transactions/recategorize
router.post('/recategorize', authenticateToken, async (req, res) => {
  console.log('Re-categorizing transactions for user:', req.user.userId);
  
  try {
    // Get all Plaid-connected access tokens for this user
    const accessTokens = await new Promise((resolve, reject) => {
      db.all(
        'SELECT DISTINCT access_token FROM cards WHERE user_id = ? AND access_token IS NOT NULL',
        [req.user.userId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.access_token));
        }
      );
    });

    console.log(`Found ${accessTokens.length} Plaid access tokens`);

    let updatedCount = 0;
    const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');
    
    const configuration = new Configuration({
      basePath: PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
          'PLAID-SECRET': process.env.PLAID_SECRET,
        },
      },
    });
    const plaidClient = new PlaidApi(configuration);

    // Process each access token
    for (const access_token of accessTokens) {
      try {
        // Get transactions from Plaid for the last 30 days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const endDate = new Date();

        const request = {
          access_token,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          count: 500,
          offset: 0,
        };

        const plaidTransactionsResponse = await plaidClient.transactionsGet(request);
        const plaidTransactions = plaidTransactionsResponse.data.transactions;

        console.log(`Got ${plaidTransactions.length} transactions from Plaid for recategorization`);

        // Update each transaction in our database
        for (const plaidTransaction of plaidTransactions) {
          // Find matching transaction in our database by Plaid transaction ID
          const dbTransaction = await new Promise((resolve, reject) => {
            db.get(
              'SELECT * FROM transactions WHERE plaid_transaction_id = ? AND user_id = ?',
              [plaidTransaction.transaction_id, req.user.userId],
              (err, row) => {
                if (err) reject(err);
                else resolve(row);
              }
            );
          });

          if (dbTransaction) {
            const newCategory = mapPlaidCategoryToUserFriendly(plaidTransaction);
            console.log(`Updating transaction ${dbTransaction.id}: ${dbTransaction.category} → ${newCategory}`);
            
            await new Promise((resolve, reject) => {
              db.run('UPDATE transactions SET category = ? WHERE id = ?', 
                [newCategory, dbTransaction.id], 
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            updatedCount++;
          }
        }
      } catch (error) {
        console.error('Error recategorizing transactions for token:', error);
      }
    }

    res.json({
      message: `Successfully recategorized ${updatedCount} transactions`,
      updated: updatedCount
    });

  } catch (error) {
    console.error('Error in recategorize endpoint:', error);
    res.status(500).json({ error: 'Server error during recategorization' });
  }
});

module.exports = setupRoutes;