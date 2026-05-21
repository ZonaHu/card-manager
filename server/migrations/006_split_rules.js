// Auto-split rules. When a Plaid transaction matches a rule (description
// substring + optional card_id + amount threshold), the sync handler peels
// off `split_amount` into a sibling transaction with a separate category.
// Use case: a METRO grocery purchase on Amex card 1004 charged above $500
// always includes a $500 paypower prepaid-card load. We want the grocery
// portion to count as Food spend and the $500 portion to count as Transfer
// (not consumption).
//
// Sibling rows have source='manual' and no plaid_transaction_id, so they
// survive transactionsSync's modified/removed paths cleanly.

exports.up = async (db, { dbRun }) => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS split_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER,
      pattern TEXT NOT NULL,
      threshold REAL NOT NULL,
      split_amount REAL NOT NULL,
      split_category TEXT NOT NULL,
      split_description TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_split_rules_user ON split_rules (user_id)`);
};
