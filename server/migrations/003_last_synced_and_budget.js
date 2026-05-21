// Add fields for sync-freshness UI ("synced X min ago") and per-category
// monthly budgets. Budget config is stored as a JSON string keyed by category
// name with target dollar amounts: e.g. {"Food":500,"Transport":150}.

async function safeAddColumn(dbRun, table, columnDef) {
  try {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'cards', `last_synced_at DATETIME`);
  await safeAddColumn(dbRun, 'users', `budget_config TEXT`);
};
