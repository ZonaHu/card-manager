// server/migrations/010_refresh_tokens.js
//
// Refresh tokens live server-side in their own table so we can rotate +
// revoke. The cookie holds an opaque random ID; the row maps it to a user.
// Each /refresh call rotates: the old token is marked revoked_at and a new
// one is issued. Defense against replay of a captured cookie.

exports.up = async (db, { dbRun }) => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id)`);
};
