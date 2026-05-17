// server/migrations/016_transactions_deleted_at.js
//
// Soft-delete column. NULL = live, ISO timestamp = deleted at that time.
// Index speeds up the "WHERE deleted_at IS NULL" filter the GET route now
// has on every query.

async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'transactions', `deleted_at TEXT`);
  await dbRun('CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at ON transactions(deleted_at)');
};
