// server/migrations/013_balance_snapshots.js
//
// Per-card daily balance snapshots. Captured at the end of each successful
// sync so the NetWorthChart can render investment / TFSA / RRSP accounts
// with their actual historical values instead of a flat line at today's
// balance. Cash + credit cards keep using the existing rollback path —
// snapshots are an additional source, not a replacement.

exports.up = async (db, { dbRun }) => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS balance_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      balance REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(card_id, date)
    )
  `);
  await dbRun('CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON balance_snapshots(user_id, date)');
};
