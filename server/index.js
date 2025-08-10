require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Card Categories and Account Types
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
    color: 'indigo',
    description: 'Registered Retirement Savings Plan'
  },
  investment: {
    label: 'Investment Account',
    icon: '📊',
    color: 'violet',
    description: 'Brokerage and investment accounts'
  },
  
  // Loans and Mortgages
  mortgage: {
    label: 'Mortgage',
    icon: '🏠',
    color: 'orange',
    description: 'Home mortgage and property loans'
  },
  loan: {
    label: 'Loan',
    icon: '💸',
    color: 'red',
    description: 'Personal loans and credit lines'
  },
  
  // Other Products
  other: {
    label: 'Other',
    icon: '📋',
    color: 'gray',
    description: 'Other financial accounts'
  }
};

// Function to categorize Plaid account types to our categories
const categorizeAccount = (plaidType, plaidSubtype) => {
  const type = plaidType?.toLowerCase();
  const subtype = plaidSubtype?.toLowerCase();
  
  // Credit accounts
  if (type === 'credit' || subtype?.includes('credit')) {
    return 'credit';
  }
  
  // Investment accounts
  if (type === 'investment') {
    if (subtype?.includes('tfsa') || subtype?.includes('tax free')) return 'tfsa';
    if (subtype?.includes('rrsp') || subtype?.includes('retirement')) return 'rrsp';
    return 'investment';
  }
  
  // Depository accounts (banking)
  if (type === 'depository') {
    if (subtype?.includes('savings') || subtype?.includes('money market')) return 'savings';
    if (subtype?.includes('checking') || subtype?.includes('chequing')) return 'chequing';
    return 'chequing'; // Default for depository
  }
  
  // Loan accounts
  if (type === 'loan') {
    if (subtype?.includes('mortgage') || subtype?.includes('home')) return 'mortgage';
    return 'loan';
  }
  
  // Default fallback
  return 'other';
};

// Plaid configuration
console.log('Configuring Plaid with environment:', process.env.PLAID_ENV);
console.log('Plaid Client ID:', process.env.PLAID_CLIENT_ID ? 'Set' : 'Not set');
console.log('Plaid Secret:', process.env.PLAID_SECRET ? 'Set' : 'Not set');

const plaidConfiguration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfiguration);

// Middleware
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Database setup
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
db.serialize(() => {
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    name TEXT NOT NULL,
    google_id TEXT UNIQUE,
    country TEXT DEFAULT 'US',
    preferred_currency TEXT DEFAULT 'USD',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Add new columns to existing users table if they don't exist
  db.run(`ALTER TABLE users ADD COLUMN country TEXT DEFAULT 'US'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column country already exists or other error:', err.message);
    }
  });
  
  db.run(`ALTER TABLE users ADD COLUMN preferred_currency TEXT DEFAULT 'USD'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column preferred_currency already exists or other error:', err.message);
    }
  });

  // Cards table
  db.run(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    last_four TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    plaid_id TEXT,
    connected BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Add currency column to existing cards table if it doesn't exist
  db.run(`ALTER TABLE cards ADD COLUMN currency TEXT DEFAULT 'USD'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column currency already exists or other error:', err.message);
    }
  });

  // Add access_token column to existing cards table if it doesn't exist
  db.run(`ALTER TABLE cards ADD COLUMN access_token TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column access_token already exists or other error:', err.message);
    }
  });

  // Add item_id column to existing cards table if it doesn't exist
  db.run(`ALTER TABLE cards ADD COLUMN item_id TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column item_id already exists or other error:', err.message);
    }
  });

  // Add plaid_transaction_id column to transactions table to prevent duplicates
  db.run(`ALTER TABLE transactions ADD COLUMN plaid_transaction_id TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column plaid_transaction_id already exists or other error:', err.message);
    } else if (!err) {
      // Create unique index for plaid_transaction_id to prevent duplicates
      db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_plaid_transaction_id ON transactions (plaid_transaction_id)`, (indexErr) => {
        if (indexErr) {
          console.log('Index creation error:', indexErr.message);
        }
      });
    }
  });

  // Add category column to cards table for account type categorization
  db.run(`ALTER TABLE cards ADD COLUMN category TEXT DEFAULT 'credit'`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column category already exists or other error:', err.message);
    }
  });

  // Add institution_name column to cards table
  db.run(`ALTER TABLE cards ADD COLUMN institution_name TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column institution_name already exists or other error:', err.message);
    }
  });

  // Add account_subtype column to cards table (from Plaid)
  db.run(`ALTER TABLE cards ADD COLUMN account_subtype TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column name')) {
      console.log('Column account_subtype already exists or other error:', err.message);
    }
  });

  // Transactions table
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    card_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    date DATE NOT NULL,
    source TEXT DEFAULT 'manual',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (card_id) REFERENCES cards (id) ON DELETE CASCADE
  )`);
});

// Passport Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/google/callback"
}, (accessToken, refreshToken, profile, done) => {
  db.get('SELECT * FROM users WHERE google_id = ?', [profile.id], (err, user) => {
    if (err) return done(err);
    
    if (user) {
      return done(null, user);
    } else {
      // Check if user exists with same email
      db.get('SELECT * FROM users WHERE email = ?', [profile.emails[0].value], (err, existingUser) => {
        if (err) return done(err);
        
        if (existingUser) {
          // Link Google account to existing user
          db.run('UPDATE users SET google_id = ? WHERE id = ?', [profile.id, existingUser.id], (err) => {
            if (err) return done(err);
            existingUser.google_id = profile.id;
            return done(null, existingUser);
          });
        } else {
          // Create new user
          db.run(
            'INSERT INTO users (name, email, google_id) VALUES (?, ?, ?)',
            [profile.displayName, profile.emails[0].value, profile.id],
            function(err) {
              if (err) return done(err);
              
              db.get('SELECT * FROM users WHERE id = ?', [this.lastID], (err, newUser) => {
                if (err) return done(err);
                return done(null, newUser);
              });
            }
          );
        }
      });
    }
  });
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, user) => {
    done(err, user);
  });
});

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    db.run(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already exists' });
          }
          return res.status(500).json({ error: 'Server error' });
        }

        const token = jwt.sign(
          { userId: this.lastID, email, name },
          JWT_SECRET,
          { expiresIn: '24h' }
        );

        res.status(201).json({
          message: 'User created successfully',
          token,
          user: { id: this.lastID, name, email }
        });
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email, name: user.name },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Login successful',
        token,
        user: { id: user.id, name: user.name, email: user.email }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Google OAuth routes
app.get('/api/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: 'http://localhost:5173' }),
  (req, res) => {
    // Generate JWT token for the authenticated user
    const token = jwt.sign(
      { userId: req.user.id, email: req.user.email, name: req.user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Redirect to frontend with token
    res.redirect(`http://localhost:5173?token=${token}&user=${encodeURIComponent(JSON.stringify({
      id: req.user.id,
      name: req.user.name,
      email: req.user.email
    }))}`);
  }
);

// User preferences routes
app.post('/api/user/preferences', authenticateToken, (req, res) => {
  const { country, currency } = req.body;
  
  if (!country || !currency) {
    return res.status(400).json({ error: 'Country and currency are required' });
  }

  db.run(
    'UPDATE users SET country = ?, preferred_currency = ? WHERE id = ?',
    [country, currency, req.user.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }
      res.json({ message: 'Preferences updated successfully' });
    }
  );
});

app.get('/api/user/preferences', authenticateToken, (req, res) => {
  console.log('Getting preferences for user ID:', req.user.userId);
  
  db.get('SELECT country, preferred_currency FROM users WHERE id = ?', [req.user.userId], (err, user) => {
    if (err) {
      console.error('Database error in preferences:', err);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    
    console.log('User preferences result:', user);
    
    if (!user) {
      console.log('User not found, returning defaults');
      return res.json({
        country: 'US',
        currency: 'USD'
      });
    }
    
    const result = {
      country: (user && user.country) || 'US',
      currency: (user && user.preferred_currency) || 'USD'
    };
    
    console.log('Returning preferences:', result);
    res.json(result);
  });
});

// Plaid routes
app.post('/api/plaid/create-link-token', authenticateToken, async (req, res) => {
  try {
    console.log('Creating Plaid link token for user:', req.user.userId);
    console.log('Plaid environment:', process.env.PLAID_ENV);
    console.log('Plaid client ID configured:', !!process.env.PLAID_CLIENT_ID);
    
    // Get user's country preference
    const userPrefs = await new Promise((resolve, reject) => {
      db.get('SELECT country, preferred_currency FROM users WHERE id = ?', [req.user.userId], (err, user) => {
        if (err) reject(err);
        else resolve(user);
      });
    });

    const country = (userPrefs && userPrefs.country) || 'US';
    const countryCodes = country === 'CA' ? ['CA'] : ['US'];
    
    const request = {
      user: {
        client_user_id: req.user.userId.toString(),
      },
      client_name: 'Card Manager',
      products: ['transactions'],
      country_codes: countryCodes,
      language: 'en',
    };

    console.log('Plaid request:', JSON.stringify(request, null, 2));
    
    const response = await plaidClient.linkTokenCreate(request);
    console.log('Plaid link token created successfully');
    res.json({ 
      link_token: response.data.link_token,
      country: country,
      currency: (userPrefs && userPrefs.preferred_currency) || (country === 'CA' ? 'CAD' : 'USD')
    });
  } catch (error) {
    console.error('Error creating link token:', error);
    console.error('Error details:', (error.response && error.response.data) || error.message);
    
    // Return more specific error information
    const errorMessage = (error.response && error.response.data && error.response.data.error_message) || error.message || 'Failed to create link token';
    res.status(500).json({ 
      error: errorMessage,
      plaid_error: (error.response && error.response.data) || null
    });
  }
});

app.post('/api/plaid/exchange-public-token', authenticateToken, async (req, res) => {
  try {
    const { public_token, institution } = req.body;

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: public_token,
    });

    const access_token = exchangeResponse.data.access_token;
    const item_id = exchangeResponse.data.item_id;

    // Get account information
    const accountsResponse = await plaidClient.accountsGet({
      access_token: access_token,
    });

    const accounts = accountsResponse.data.accounts;

    // Get user's currency preference
    const userCurrency = await new Promise((resolve, reject) => {
      db.get('SELECT preferred_currency FROM users WHERE id = ?', [req.user.userId], (err, user) => {
        if (err) reject(err);
        else resolve((user && user.preferred_currency) || 'USD');
      });
    });

    // Store accounts in database with automatic categorization
    const insertPromises = accounts.map(account => {
      return new Promise((resolve, reject) => {
        // Auto-categorize based on Plaid account type and subtype
        const category = categorizeAccount(account.type, account.subtype);
        
        db.run(
          'INSERT INTO cards (user_id, name, type, last_four, balance, currency, plaid_id, connected, access_token, item_id, category, institution_name, account_subtype) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            req.user.userId,
            `${institution.name} ${account.subtype || account.type}`,
            account.type === 'credit' ? 'credit' : 'debit',
            account.mask || '0000',
            account.balances.current || 0,
            userCurrency,
            account.account_id,
            true,
            access_token,
            item_id,
            category,
            institution.name,
            account.subtype
          ],
          function(err) {
            if (err) reject(err);
            else resolve({ 
              id: this.lastID,
              name: `${institution.name} ${account.subtype || account.type}`,
              type: account.type === 'credit' ? 'credit' : 'debit',
              last_four: account.mask || '0000',
              balance: account.balances.current || 0,
              currency: userCurrency,
              plaid_id: account.account_id,
              connected: true,
              access_token: access_token,
              item_id: item_id,
              category: category,
              institution_name: institution.name,
              account_subtype: account.subtype,
              categoryInfo: CARD_CATEGORIES[category] || CARD_CATEGORIES.other
            });
          }
        );
      });
    });

    const savedAccounts = await Promise.all(insertPromises);

    // Get recent transactions
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: access_token,
      start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date: new Date().toISOString().split('T')[0],
    });

    // Store transactions in database
    const transactionPromises = transactionsResponse.data.transactions.map(transaction => {
      const matchingAccount = savedAccounts.find(acc => acc.plaid_id === transaction.account_id);
      if (!matchingAccount) return Promise.resolve();

      return new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO transactions (user_id, card_id, amount, description, category, date, source, plaid_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            req.user.userId,
            matchingAccount.id,
            -transaction.amount, // Plaid uses positive for outgoing, we use negative
            transaction.name,
            transaction.category?.[0] || 'Other',
            transaction.date,
            'plaid',
            transaction.transaction_id
          ],
          function(err) {
            if (err && !err.message.includes('UNIQUE constraint failed')) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    });

    await Promise.all(transactionPromises);

    res.json({ 
      accounts: savedAccounts,
      message: 'Successfully connected accounts and imported transactions'
    });

  } catch (error) {
    console.error('Error exchanging public token:', error);
    res.status(500).json({ error: 'Failed to connect accounts' });
  }
});

// Plaid sync endpoint
app.post('/api/plaid/sync-transactions', authenticateToken, async (req, res) => {
  try {
    console.log('Syncing transactions for user:', req.user.userId);
    
    // Get all Plaid-connected cards for this user
    const plaidCards = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM cards WHERE user_id = ? AND plaid_id IS NOT NULL AND access_token IS NOT NULL', [req.user.userId], (err, cards) => {
        if (err) reject(err);
        else resolve(cards);
      });
    });

    if (plaidCards.length === 0) {
      return res.status(400).json({ error: 'No Plaid-connected accounts found. Please connect your bank account first.' });
    }

    console.log(`Found ${plaidCards.length} Plaid-connected cards`);
    
    let totalSynced = 0;
    let newTransactions = 0;

    // Group cards by access_token to minimize API calls
    const cardsByToken = plaidCards.reduce((acc, card) => {
      if (!acc[card.access_token]) {
        acc[card.access_token] = [];
      }
      acc[card.access_token].push(card);
      return acc;
    }, {});

    for (const [access_token, cards] of Object.entries(cardsByToken)) {
      try {
        // Get transactions from the last 30 days
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        const endDate = new Date();
        
        console.log(`Fetching transactions from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
        
        const transactionsResponse = await plaidClient.transactionsGet({
          access_token: access_token,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          count: 500,
          offset: 0
        });

        const transactions = transactionsResponse.data.transactions;
        console.log(`Retrieved ${transactions.length} transactions from Plaid`);

        // Process transactions for each card
        for (const transaction of transactions) {
          const matchingCard = cards.find(card => card.plaid_id === transaction.account_id);
          if (!matchingCard) continue;

          // Check if transaction already exists using Plaid transaction ID
          const existingTransaction = await new Promise((resolve, reject) => {
            db.get(
              'SELECT id FROM transactions WHERE plaid_transaction_id = ?',
              [transaction.transaction_id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row);
              }
            );
          });

          // Only insert if transaction doesn't exist
          if (!existingTransaction) {
            await new Promise((resolve, reject) => {
              db.run(
                'INSERT INTO transactions (user_id, card_id, amount, description, category, date, source, plaid_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [
                  req.user.userId,
                  matchingCard.id,
                  -transaction.amount, // Plaid uses positive for outgoing, we use negative
                  transaction.name,
                  transaction.category?.[0] || 'Other',
                  transaction.date,
                  'plaid',
                  transaction.transaction_id
                ],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
            newTransactions++;
          }
          totalSynced++;
        }

        // Update account balances
        const accountsResponse = await plaidClient.accountsGet({
          access_token: access_token,
        });

        const accounts = accountsResponse.data.accounts;
        
        for (const account of accounts) {
          const matchingCard = cards.find(card => card.plaid_id === account.account_id);
          if (matchingCard) {
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE cards SET balance = ? WHERE id = ?',
                [account.balances.current || 0, matchingCard.id],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
        }

      } catch (tokenError) {
        console.error('Error syncing transactions for access token:', tokenError);
        
        // If access token is invalid, mark cards as disconnected
        if (tokenError.response?.data?.error_code === 'INVALID_ACCESS_TOKEN') {
          for (const card of cards) {
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE cards SET connected = FALSE, access_token = NULL, item_id = NULL WHERE id = ?',
                [card.id],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
        }
      }
    }

    res.json({
      message: 'Transaction sync completed successfully',
      totalTransactions: totalSynced,
      newTransactions: newTransactions,
      cardsProcessed: plaidCards.length
    });

  } catch (error) {
    console.error('Error syncing transactions:', error);
    res.status(500).json({ 
      error: 'Failed to sync transactions',
      details: error.message
    });
  }
});

// Comprehensive Plaid sync endpoint with date range support
app.post('/api/plaid/sync-all-transactions', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, months = 3 } = req.body;
    
    console.log('Syncing all transaction histories for user:', req.user.userId);
    
    // Calculate date range
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - (months * 30 * 24 * 60 * 60 * 1000));
    
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];
    
    console.log(`Syncing transactions from ${startDateStr} to ${endDateStr}`);
    
    // Get all Plaid-connected cards for this user
    const plaidCards = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM cards WHERE user_id = ? AND plaid_id IS NOT NULL AND access_token IS NOT NULL', [req.user.userId], (err, cards) => {
        if (err) reject(err);
        else resolve(cards);
      });
    });

    if (plaidCards.length === 0) {
      return res.status(400).json({ error: 'No Plaid-connected accounts found. Please connect your bank account first.' });
    }

    console.log(`Found ${plaidCards.length} Plaid-connected cards`);
    
    let totalSynced = 0;
    let newTransactions = 0;
    const processedTokens = new Set();

    // Group cards by access_token to minimize API calls
    const cardsByToken = plaidCards.reduce((acc, card) => {
      if (!acc[card.access_token]) {
        acc[card.access_token] = [];
      }
      acc[card.access_token].push(card);
      return acc;
    }, {});

    for (const [access_token, cards] of Object.entries(cardsByToken)) {
      if (processedTokens.has(access_token)) continue;
      processedTokens.add(access_token);
      
      try {
        console.log(`Processing ${cards.length} accounts for access token`);
        
        // Fetch all transactions in batches (Plaid API has pagination)
        let offset = 0;
        const batchSize = 500;
        let hasMore = true;
        
        while (hasMore) {
          const transactionsResponse = await plaidClient.transactionsGet({
            access_token: access_token,
            start_date: startDateStr,
            end_date: endDateStr,
            count: batchSize,
            offset: offset
          });

          const transactions = transactionsResponse.data.transactions;
          const totalTransactions = transactionsResponse.data.total_transactions;
          
          console.log(`Retrieved ${transactions.length} transactions (${offset + 1}-${offset + transactions.length} of ${totalTransactions})`);

          // Process each transaction
          for (const transaction of transactions) {
            const matchingCard = cards.find(card => card.plaid_id === transaction.account_id);
            if (!matchingCard) continue;

            // Check if transaction already exists using Plaid transaction ID
            const existingTransaction = await new Promise((resolve, reject) => {
              db.get(
                'SELECT id FROM transactions WHERE plaid_transaction_id = ?',
                [transaction.transaction_id],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                }
              );
            });

            // Only insert if transaction doesn't exist
            if (!existingTransaction) {
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO transactions (user_id, card_id, amount, description, category, date, source, plaid_transaction_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                  [
                    req.user.userId,
                    matchingCard.id,
                    -transaction.amount, // Plaid uses positive for outgoing, we use negative
                    transaction.name,
                    transaction.category?.[0] || 'Other',
                    transaction.date,
                    'plaid',
                    transaction.transaction_id
                  ],
                  function(err) {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });
              newTransactions++;
            }
            totalSynced++;
          }

          // Check if there are more transactions to fetch
          offset += batchSize;
          hasMore = offset < totalTransactions;
        }

        // Update account balances
        const accountsResponse = await plaidClient.accountsGet({
          access_token: access_token,
        });

        const accounts = accountsResponse.data.accounts;
        
        for (const account of accounts) {
          const matchingCard = cards.find(card => card.plaid_id === account.account_id);
          if (matchingCard) {
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE cards SET balance = ? WHERE id = ?',
                [account.balances.current || 0, matchingCard.id],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
        }

      } catch (tokenError) {
        console.error('Error syncing transactions for access token:', tokenError);
        
        // If access token is invalid, mark cards as disconnected
        if (tokenError.response?.data?.error_code === 'INVALID_ACCESS_TOKEN') {
          console.log('Invalid access token detected, marking cards as disconnected');
          for (const card of cards) {
            await new Promise((resolve, reject) => {
              db.run(
                'UPDATE cards SET connected = FALSE, access_token = NULL, item_id = NULL WHERE id = ?',
                [card.id],
                function(err) {
                  if (err) reject(err);
                  else resolve();
                }
              );
            });
          }
        }
      }
    }

    res.json({
      message: 'Complete transaction history sync completed successfully',
      totalTransactions: totalSynced,
      newTransactions: newTransactions,
      cardsProcessed: plaidCards.length,
      dateRange: {
        startDate: startDateStr,
        endDate: endDateStr
      }
    });

  } catch (error) {
    console.error('Error syncing all transactions:', error);
    res.status(500).json({ 
      error: 'Failed to sync transaction histories',
      details: error.message
    });
  }
});

// Card Categories API
app.get('/api/card-categories', (req, res) => {
  res.json(CARD_CATEGORIES);
});

// Cards routes
app.get('/api/cards', authenticateToken, (req, res) => {
  db.all('SELECT * FROM cards WHERE user_id = ?', [req.user.userId], (err, cards) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    
    // Enhance cards with category information
    const enhancedCards = cards.map(card => ({
      ...card,
      categoryInfo: CARD_CATEGORIES[card.category] || CARD_CATEGORIES.other
    }));
    
    res.json(enhancedCards);
  });
});

app.post('/api/cards', authenticateToken, (req, res) => {
  const { name, type, lastFour, balance, currency, category } = req.body;

  if (!name || !type || !lastFour || balance === undefined) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validate category
  const validCategory = category && CARD_CATEGORIES[category] ? category : 'other';

  db.run(
    'INSERT INTO cards (user_id, name, type, last_four, balance, currency, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.userId, name, type, lastFour, balance, currency || 'USD', validCategory],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      db.get('SELECT * FROM cards WHERE id = ?', [this.lastID], (err, card) => {
        if (err) {
          return res.status(500).json({ error: 'Server error' });
        }
        
        // Add category information to response
        const enhancedCard = {
          ...card,
          categoryInfo: CARD_CATEGORIES[card.category] || CARD_CATEGORIES.other
        };
        
        res.status(201).json(enhancedCard);
      });
    }
  );
});

app.delete('/api/cards/:id', authenticateToken, (req, res) => {
  const cardId = req.params.id;

  db.run(
    'DELETE FROM cards WHERE id = ? AND user_id = ?',
    [cardId, req.user.userId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: 'Server error' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Card not found' });
      }

      // Also delete associated transactions
      db.run('DELETE FROM transactions WHERE card_id = ?', [cardId], (err) => {
        if (err) {
          console.error('Error deleting transactions:', err);
        }
      });

      res.json({ message: 'Card deleted successfully' });
    }
  );
});

// Transactions routes
app.get('/api/transactions', authenticateToken, (req, res) => {
  db.all('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC', [req.user.userId], (err, transactions) => {
    if (err) {
      return res.status(500).json({ error: 'Server error' });
    }
    res.json(transactions);
  });
});

app.post('/api/transactions', authenticateToken, (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});