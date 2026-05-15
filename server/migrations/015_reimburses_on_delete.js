// server/migrations/015_reimburses_on_delete.js
//
// SQLite doesn't support ALTER TABLE … ADD FOREIGN KEY, and the existing
// reimburses_id column was created without an ON DELETE clause (migration
// 011). When the user deletes a purchase, the reimbursement row keeps a
// dangling pointer — the UI then silently shows nothing for the link and
// spendCalculation skips the reimbursement entirely.
//
// Workaround: scrub any reimburses_id values that already point at deleted
// rows, then trust the same scrub-on-purchase-delete in the DELETE path.
// Adding a trigger keeps this enforced even when deletes happen outside
// our code (manual sqlite3 sessions, future routes).

exports.up = async (db, { dbRun }) => {
  // First, null out any orphaned reimburses_id values from before this
  // trigger existed.
  await dbRun(`
    UPDATE transactions
    SET reimburses_id = NULL
    WHERE reimburses_id IS NOT NULL
      AND reimburses_id NOT IN (SELECT id FROM transactions)
  `);

  // Trigger: when a purchase is deleted, clear any reimbursement pointers
  // at it. NULL-ing rather than cascading the delete because the user may
  // still want the inbound row visible as "money received from a friend"
  // even after they remove the original purchase.
  await dbRun(`
    CREATE TRIGGER IF NOT EXISTS scrub_reimburses_on_delete
    AFTER DELETE ON transactions
    BEGIN
      UPDATE transactions SET reimburses_id = NULL WHERE reimburses_id = OLD.id;
    END
  `);
};
