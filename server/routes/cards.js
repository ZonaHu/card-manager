const express = require('express');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Database will be injected when routes are setup
let db;

const setupRoutes = (database) => {
  db = database;
  return router;
};

// GET /api/cards
router.get('/', authenticateToken, (req, res) => {
  db.all(
    'SELECT * FROM cards WHERE user_id = ? ORDER BY name ASC',
    [req.user.userId],
    (err, cards) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }
      res.json(cards);
    }
  );
});

// POST /api/cards
router.post('/', authenticateToken, (req, res) => {
  const { name, type, lastFour, balance, currency, category } = req.body;

  if (!name || !type || !lastFour || balance === undefined) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    'INSERT INTO cards (user_id, name, type, last_four, balance, currency, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.userId, name, type, lastFour, balance, currency || 'USD', category || 'credit'],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      db.get('SELECT * FROM cards WHERE id = ?', [this.lastID], (err, card) => {
        if (err) {
          return res.status(500).json({ error: 'Server error' });
        }
        res.status(201).json(card);
      });
    }
  );
});

// DELETE /api/cards/:id
router.delete('/:id', authenticateToken, (req, res) => {
  const cardId = req.params.id;

  // First verify the card belongs to the user
  db.get('SELECT * FROM cards WHERE id = ? AND user_id = ?', [cardId, req.user.userId], (err, card) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    // Delete the card (CASCADE will handle related transactions)
    db.run('DELETE FROM cards WHERE id = ? AND user_id = ?', [cardId, req.user.userId], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Card not found' });
      }

      res.json({ message: 'Card deleted successfully' });
    });
  });
});

module.exports = setupRoutes;