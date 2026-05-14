// server/migrations/008_plaid_items.js
//
// Centralize per-Plaid-item state (access_token, cursor, reauth) on a new
// plaid_items row instead of duplicating it across every card. Cards point
// at their item via cards.plaid_item_pk. Existing card columns stay until
// Task 3 finishes the cutover.

async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await dbRun(`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id TEXT NOT NULL,
      institution_name TEXT,
      access_token TEXT NOT NULL,
      sync_cursor TEXT,
      needs_reauth INTEGER DEFAULT 0,
      reauth_error_code TEXT,
      last_synced_at DATETIME,
      last_sync_attempt_at DATETIME,
      last_sync_error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, item_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_plaid_items_user ON plaid_items(user_id)`);
  await safeAddColumn(dbRun, 'cards', `plaid_item_pk INTEGER`);

  // Backfill: for every distinct (user_id, item_id) that already has cards,
  // create a plaid_items row using the access_token from the first card.
  const cardRows = await new Promise((res, rej) =>
    db.all(`SELECT user_id, item_id, MIN(access_token) AS access_token,
                   MIN(institution_name) AS institution_name,
                   MAX(needs_reauth) AS needs_reauth,
                   MAX(reauth_error_code) AS reauth_error_code,
                   MAX(plaid_sync_cursor) AS sync_cursor,
                   MAX(last_synced_at) AS last_synced_at,
                   MAX(last_sync_attempt_at) AS last_sync_attempt_at,
                   MAX(last_sync_error) AS last_sync_error
            FROM cards
            WHERE item_id IS NOT NULL AND access_token IS NOT NULL
            GROUP BY user_id, item_id`,
      (e, r) => e ? rej(e) : res(r)));

  for (const row of cardRows) {
    await dbRun(
      `INSERT OR IGNORE INTO plaid_items
       (user_id, item_id, institution_name, access_token, sync_cursor,
        needs_reauth, reauth_error_code, last_synced_at, last_sync_attempt_at, last_sync_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.user_id, row.item_id, row.institution_name, row.access_token,
       row.sync_cursor, row.needs_reauth || 0, row.reauth_error_code,
       row.last_synced_at, row.last_sync_attempt_at, row.last_sync_error]
    );
    // Wire cards.plaid_item_pk
    await dbRun(
      `UPDATE cards SET plaid_item_pk = (SELECT id FROM plaid_items WHERE user_id=? AND item_id=?)
       WHERE user_id=? AND item_id=?`,
      [row.user_id, row.item_id, row.user_id, row.item_id]
    );
  }
};
