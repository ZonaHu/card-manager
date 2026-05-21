// Indexes for the queries that run on every dashboard render and sync.
//
// transactions(user_id, date DESC) — covers the "give me this user's recent
//   transactions ordered by date" pattern used by GET /api/transactions and
//   the monthly window filters.
// transactions(card_id, date) — covers per-card detail views and the
//   reconcile-removed-transactions helper which filters by card_id + date.
// cards(user_id) — every authenticated request scopes cards by user.

exports.up = async (db, { dbRun }) => {
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_transactions_user_date
               ON transactions (user_id, date DESC)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_transactions_card_date
               ON transactions (card_id, date)`);
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_cards_user_id
               ON cards (user_id)`);
};
