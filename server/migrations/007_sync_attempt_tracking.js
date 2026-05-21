// Track every sync attempt, not just successful ones. last_synced_at only
// stamps on success, so a card that's been failing for days still shows as
// "synced X min ago". last_sync_attempt_at + last_sync_error give the UI
// enough to say "last attempt 5m ago — bank login required" or similar.

async function safeAddColumn(dbRun, table, columnDef) {
  try {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'cards', `last_sync_attempt_at DATETIME`);
  await safeAddColumn(dbRun, 'cards', `last_sync_error TEXT`);
};
