const { PlaidApi, Configuration, PlaidEnvironments } = require('plaid');

// Plaid client singleton, configured from env. Imported wherever we hit Plaid.
const plaidConfiguration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});
const plaidClient = new PlaidApi(plaidConfiguration);

// Plaid error codes that mean the user must re-verify via Link's update mode.
// Distinct from INVALID_ACCESS_TOKEN, which requires a fresh Link flow + new item.
const REAUTH_ERROR_CODES = new Set([
  'ITEM_LOGIN_REQUIRED',
  'ITEM_LOCKED',
  'NEW_MFA_NEEDED',
  'PENDING_EXPIRATION',
  'PENDING_DISCONNECT'
]);

// Description-based detectors that take precedence over Plaid's category
// signal, since Plaid often returns "Other" / TRANSFER_IN for things the user
// thinks of as ATM withdrawals, bank deposits, or rent.
// Cash withdrawal patterns. The standalone `^draft` term was previously here
// but matched too aggressively (e.g. "Draft Beer Hall"); the bracket-code
// variant covers the actual bank format we see ("[DM]0442 DRAFT 020748373")
// and "bank draft" / "money order" cover the natural-language cases.
const CASH_OUT_RE = /\b(atm withdrawal|atm wd|cash advance|bank draft|money order|\[dm\] *\d+ *draft)\b/i;
const DEPOSIT_RE = /\b(deposit paypal|internet deposit|^deposit\b|electronic funds transfer|direct deposit)\b/i;
// Rent + utility/telecom vendors Plaid often miscategorizes. Bills bucket so
// the existing budget/category breakdown handles them correctly; the
// front-end FixedCostsPanel does the per-vendor grouping on top.
const BILLS_RE = /\bchexy\b|\bmetergy\b|\benbridge\b|\btoronto hydro\b|\bhydro one\b|\bbell canada\b|\brogers bk\b|\bfido\b|\bkoodo\b|\btelus mobility\b|\brogers wireless\b/i;

function detectByDescription(desc) {
  if (!desc) return null;
  if (CASH_OUT_RE.test(desc)) return 'Cash';
  if (BILLS_RE.test(desc)) return 'Bills';
  // Direct deposit + payroll usually mean income — let the existing rule
  // handle "Direct deposit" suffix below; only treat plain "DEPOSIT *" as a
  // generic Deposit.
  if (/direct deposit/i.test(desc)) return null;
  if (DEPOSIT_RE.test(desc)) return 'Deposit';
  return null;
}

// Maps Plaid transaction categories (both personal_finance_category and the
// older string-array `category` field) into our internal user-facing labels.
function mapPlaidCategoryToUserFriendly(transaction) {
  const descMatch = detectByDescription(transaction && transaction.name);
  if (descMatch) return descMatch;
  const pfc = transaction.personal_finance_category;
  const legacy = transaction.category;

  if (pfc && pfc.primary) {
    const mappings = {
      'FOOD_AND_DRINK': 'Food',
      'TRANSPORTATION': 'Transport',
      'GENERAL_MERCHANDISE': 'Shopping',
      'ENTERTAINMENT': 'Entertainment',
      'TRAVEL': 'Travel',
      'MEDICAL': 'Health',
      'PERSONAL_CARE': 'Health',
      'BANK_FEES': 'Bills',
      'LOAN_PAYMENTS': 'Bills',
      'RENT_AND_UTILITIES': 'Bills',
      'GENERAL_SERVICES': 'Bills',
      'INCOME': 'Income',
      'TRANSFER_IN': 'Other',
      'TRANSFER_OUT': 'Other',
      'DEPOSIT': 'Other'
    };
    const mapped = mappings[pfc.primary];
    if (mapped) return mapped;
    return pfc.primary.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  if (!legacy || legacy.length === 0) return 'Other';

  const specific = legacy[legacy.length - 1];
  const general = legacy[0];
  const legacyMap = {
    'Food and Drink': 'Food', 'Restaurants': 'Food', 'Fast Food': 'Food', 'Coffee Shop': 'Food', 'Bar': 'Food',
    'Nightlife': 'Entertainment',
    'Transportation': 'Transport', 'Gas Stations': 'Transport', 'Parking': 'Transport',
    'Public Transportation': 'Transport', 'Taxi': 'Transport', 'Ride Share': 'Transport',
    'Shops': 'Shopping', 'Department Stores': 'Shopping', 'Clothing and Accessories': 'Shopping',
    'Electronics': 'Shopping', 'Home Improvement': 'Shopping',
    'Grocery': 'Food', 'Supermarkets and Other Grocery Stores': 'Food',
    'Recreation': 'Entertainment', 'Entertainment': 'Entertainment',
    'Movies and DVDs': 'Entertainment', 'Music, Video and DVD': 'Entertainment',
    'Travel': 'Travel', 'Airlines and Aviation Services': 'Travel', 'Lodging': 'Travel', 'Car Rental': 'Travel',
    'Payment': 'Bills', 'Credit Card': 'Bills', 'Bank Fees': 'Bills', 'Service Charges': 'Bills',
    'Utilities': 'Bills', 'Internet and Cable': 'Bills', 'Mobile Phone': 'Bills', 'Insurance': 'Bills',
    'Healthcare': 'Health', 'Dentist': 'Health', 'Doctor': 'Health', 'Pharmacy': 'Health',
    'Deposit': 'Other', 'Transfer In': 'Other', 'Transfer Out': 'Other',
    'Payroll': 'Income', 'Interest Earned': 'Income'
  };
  return legacyMap[specific] || legacyMap[general] || specific || 'Other';
}

// Helpers below are db-aware. They take the db instance as first arg so the
// caller decides connection lifecycle.

function markCardsNeedReauth(db, cardIds, errorCode) {
  if (!cardIds.length) return Promise.resolve();
  const placeholders = cardIds.map(() => '?').join(',');
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE cards SET needs_reauth = 1, reauth_error_code = ? WHERE id IN (${placeholders})`,
      [errorCode, ...cardIds],
      err => err ? reject(err) : resolve()
    );
  });
}

function clearCardsReauth(db, cardIds) {
  if (!cardIds.length) return Promise.resolve();
  const placeholders = cardIds.map(() => '?').join(',');
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE cards SET needs_reauth = 0, reauth_error_code = NULL WHERE id IN (${placeholders})`,
      cardIds,
      err => err ? reject(err) : resolve()
    );
  });
}

// Reconcile transactions that Plaid no longer reports for a window.
// transactionsGet returns the CURRENT state, so anything that once existed and
// has since been removed (duplicates, pending->posted swaps, merchant reversals)
// simply doesn't appear. We delete local Plaid-sourced rows in the same
// [startDate,endDate] window whose plaid_transaction_id is not in returnedIds.
// Only safe to call after successful full pagination — an incomplete response
// would falsely delete valid rows.
function reconcileRemovedTransactions(db, userId, cardIds, startDate, endDate, returnedIds) {
  if (!cardIds.length) return Promise.resolve(0);
  const placeholders = cardIds.map(() => '?').join(',');
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, plaid_transaction_id FROM transactions
       WHERE user_id = ? AND source = 'plaid' AND plaid_transaction_id IS NOT NULL
         AND card_id IN (${placeholders}) AND date >= ? AND date <= ?`,
      [userId, ...cardIds, startDate, endDate],
      (err, rows) => {
        if (err) return reject(err);
        const stale = rows.filter(r => !returnedIds.has(r.plaid_transaction_id));
        if (stale.length === 0) return resolve(0);
        const ids = stale.map(r => r.id);
        const delPlaceholders = ids.map(() => '?').join(',');
        db.run(
          `DELETE FROM transactions WHERE id IN (${delPlaceholders})`,
          ids,
          function (delErr) { delErr ? reject(delErr) : resolve(stale.length); }
        );
      }
    );
  });
}

module.exports = {
  plaidClient,
  REAUTH_ERROR_CODES,
  mapPlaidCategoryToUserFriendly,
  markCardsNeedReauth,
  clearCardsReauth,
  reconcileRemovedTransactions
};
