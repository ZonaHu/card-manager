// User-defined category overrides per merchant. Whenever a Plaid (or manual)
// transaction's description contains the rule's pattern (case-insensitive
// substring), the rule's category wins over Plaid's classification. Lets
// the user teach the system once and have it stick.

exports.up = async (db, { dbRun }) => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS categorization_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      pattern TEXT NOT NULL,
      category TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_categorization_rules_user
               ON categorization_rules (user_id)`);
};
