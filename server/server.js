require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Middleware
const { authenticateToken } = require('./middleware/auth');

// Routes
const setupTransactionRoutes = require('./routes/transactions');
const setupCardRoutes = require('./routes/cards');

// Services
const PlaidService = require('./services/plaidService');

// Configuration
const { CATEGORIES } = require('./config/categories');

const app = express();
const PORT = process.env.PORT || 3001;

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

// Services
const plaidService = new PlaidService();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/transactions', setupTransactionRoutes(db));
app.use('/api/cards', setupCardRoutes(db));

// User preferences endpoint
app.get('/api/user/preferences', authenticateToken, (req, res) => {
  console.log('Getting preferences for user ID:', req.user.userId);
  
  db.get('SELECT country, preferred_currency FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
    
    console.log('User preferences result:', user);
    const preferences = {
      country: user?.country || 'US',
      currency: user?.preferred_currency || 'USD'
    };
    
    console.log('Returning preferences:', preferences);
    res.json(preferences);
  });
});

// Card categories endpoint
app.get('/api/card-categories', authenticateToken, (req, res) => {
  const CARD_CATEGORIES = {
    // Credit Products
    credit: {
      label: 'Credit Card',
      icon: '💳',
      color: 'blue',
      description: 'Credit cards and lines of credit'
    },
    
    // Banking Products  
    chequing: {
      label: 'Chequing Account',
      icon: '🏦',
      color: 'green',
      description: 'Primary banking and spending account'
    },
    savings: {
      label: 'Savings Account',
      icon: '💰',
      color: 'emerald',
      description: 'Savings and high-interest accounts'
    },
    
    // Investment Accounts
    tfsa: {
      label: 'TFSA',
      icon: '📈',
      color: 'purple',
      description: 'Tax-Free Savings Account'
    },
    rrsp: {
      label: 'RRSP',
      icon: '🎯',
      color: 'orange',
      description: 'Registered Retirement Savings Plan'
    }
  };
  
  res.json(CARD_CATEGORIES);
});

// Plaid endpoints
app.post('/api/create-link-token', authenticateToken, async (req, res) => {
  try {
    const { country } = req.body;
    const linkToken = await plaidService.createLinkToken(req.user.userId, country || 'US');
    res.json({ link_token: linkToken });
  } catch (error) {
    console.error('Error creating link token:', error);
    res.status(500).json({ error: 'Unable to create link token' });
  }
});

app.post('/api/exchange-public-token', authenticateToken, async (req, res) => {
  try {
    const { public_token } = req.body;
    const { access_token, item_id } = await plaidService.exchangePublicToken(public_token);
    
    // Get accounts from Plaid
    const accounts = await plaidService.getAccounts(access_token);
    
    // Save accounts as cards
    const savedAccounts = [];
    for (const account of accounts) {
      const result = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO cards (user_id, name, type, last_four, balance, currency, plaid_id, connected, access_token, item_id, category, institution_name, account_subtype) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            req.user.userId,
            account.name,
            account.type,
            account.mask || '0000',
            account.balances.current || 0,
            account.balances.iso_currency_code || 'USD',
            account.account_id,
            true,
            access_token,
            item_id,
            account.type === 'credit' ? 'credit' : 'chequing',
            account.official_name || account.name,
            account.subtype
          ],
          function(err) {
            if (err) reject(err);
            else {
              db.get('SELECT * FROM cards WHERE id = ?', [this.lastID], (err, card) => {
                if (err) reject(err);
                else resolve(card);
              });
            }
          }
        );
      });
      
      savedAccounts.push(result);
    }

    // Sync initial transactions
    try {
      const syncResult = await plaidService.syncTransactionsForUser(db, req.user.userId);
      console.log('Initial sync result:', syncResult);
    } catch (syncError) {
      console.error('Error during initial transaction sync:', syncError);
    }

    res.json({ 
      accounts: savedAccounts,
      message: 'Successfully connected accounts and imported transactions'
    });

  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: 'Unable to exchange public token' });
  }
});

// Transaction sync endpoints
app.post('/api/sync-transactions', authenticateToken, async (req, res) => {
  try {
    const { months } = req.query;
    const result = await plaidService.syncTransactionsForUser(
      db, 
      req.user.userId, 
      months ? parseInt(months) : 3
    );
    res.json(result);
  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({ error: 'Unable to sync transactions' });
  }
});

app.post('/api/sync-recent-transactions', authenticateToken, async (req, res) => {
  try {
    const result = await plaidService.syncTransactionsForUser(db, req.user.userId, 1);
    res.json(result);
  } catch (error) {
    console.error('Error syncing recent transactions:', error);
    res.status(500).json({ error: 'Unable to sync recent transactions' });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`Configuring Plaid with environment: ${process.env.PLAID_ENV || 'sandbox'}`);
  console.log(`Plaid Client ID: ${process.env.PLAID_CLIENT_ID ? 'Set' : 'Missing'}`);
  console.log(`Plaid Secret: ${process.env.PLAID_SECRET ? 'Set' : 'Missing'}`);
  console.log(`Server running on port ${PORT}`);
});