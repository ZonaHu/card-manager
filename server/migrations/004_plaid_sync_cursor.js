// Adds the opaque per-item cursor returned by Plaid's transactionsSync API.
// Stored on every card sharing an item — they all keep the same value, kept
// in sync by the sync handler. Simpler than introducing a separate plaid_items
// table; the column-level redundancy is cheap.
//
// JWT revocation column on users is here too: bumping token_version on logout
// or password change invalidates every previously-issued JWT for that user.

async function safeAddColumn(dbRun, table, columnDef) {
  try {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'cards', `plaid_sync_cursor TEXT`);
  await safeAddColumn(dbRun, 'users', `token_version INTEGER NOT NULL DEFAULT 1`);
};
