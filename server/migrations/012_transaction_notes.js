// server/migrations/012_transaction_notes.js
//
// Free-form user notes attached to a transaction. Survives sync cycles —
// reconcileRemovedTransactions deletes by id, so as long as Plaid keeps
// returning the same transaction_id, the note stays put.

async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'transactions', `notes TEXT`);
};
