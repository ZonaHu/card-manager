// server/migrations/009_transaction_pending_and_currency.js
//
// Plaid transactionsSync returns pending boolean plus iso_currency_code and
// unofficial_currency_code per transaction. Capturing these lets us exclude
// not-yet-posted txns from spend aggregates and show a currency hint when
// the txn was charged in a different currency than the card's home currency.

async function safeAddColumn(dbRun, table, columnDef) {
  try { await dbRun(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (err) {
    if (!String(err && err.message).includes('duplicate column name')) throw err;
  }
}

exports.up = async (db, { dbRun }) => {
  await safeAddColumn(dbRun, 'transactions', `pending INTEGER DEFAULT 0`);
  await safeAddColumn(dbRun, 'transactions', `transaction_currency TEXT`);
  await safeAddColumn(dbRun, 'transactions', `original_amount REAL`);
};
