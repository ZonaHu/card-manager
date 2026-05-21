// Baseline schema. Idempotent so existing databases that were initialized
// via the old in-line db.serialize block end up in the same state as a
// fresh database after this migration runs.
//
// All operations use IF NOT EXISTS or are wrapped to swallow "duplicate
// column name" errors, which is the SQLite signal that a column already exists.

async function safeAddColumn(dbRun, table, columnDef) {
  try {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await dbRun(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT,
    name TEXT NOT NULL,
    google_id TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await safeAddColumn(dbRun, 'users', `country TEXT DEFAULT 'US'`);
  await safeAddColumn(dbRun, 'users', `preferred_currency TEXT DEFAULT 'USD'`);

  await dbRun(`CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    last_four TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 0,
    plaid_id TEXT,
    connected BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);
  await safeAddColumn(dbRun, 'cards', `currency TEXT DEFAULT 'USD'`);
  await safeAddColumn(dbRun, 'cards', `access_token TEXT`);
  await safeAddColumn(dbRun, 'cards', `item_id TEXT`);
  await safeAddColumn(dbRun, 'cards', `category TEXT DEFAULT 'credit'`);
  await safeAddColumn(dbRun, 'cards', `institution_name TEXT`);
  await safeAddColumn(dbRun, 'cards', `account_subtype TEXT`);
  await safeAddColumn(dbRun, 'cards', `needs_reauth INTEGER DEFAULT 0`);
  await safeAddColumn(dbRun, 'cards', `reauth_error_code TEXT`);

  await dbRun(`CREATE TABLE IF NOT EXISTS transactions (
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
  await safeAddColumn(dbRun, 'transactions', `plaid_transaction_id TEXT`);

  await dbRun(`CREATE UNIQUE INDEX IF NOT EXISTS idx_plaid_transaction_id
               ON transactions (plaid_transaction_id)`);
};
