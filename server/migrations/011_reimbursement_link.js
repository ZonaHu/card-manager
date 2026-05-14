// server/migrations/011_reimbursement_link.js
//
// Lets a positive transaction (e.g. a friend's e-Transfer paying back their
// share of a dinner) link to the original purchase it reimburses. The spend
// calculator then treats the reimbursed portion as reducing the purchase's
// contribution to monthly spend instead of as standalone income.

async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'transactions', `reimburses_id INTEGER REFERENCES transactions(id)`);
  await dbRun('CREATE INDEX IF NOT EXISTS idx_transactions_reimburses ON transactions(reimburses_id)');
};
