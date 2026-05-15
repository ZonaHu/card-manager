// server/lib/balanceSnapshots.js
//
// CRUD around the balance_snapshots table. Idempotent per (card_id, date)
// thanks to the UNIQUE constraint + ON CONFLICT upsert — safe to call once
// per sync without worrying about double-writes.

function recordSnapshots(db, userId, cards, dateStr) {
  const date = dateStr || new Date().toISOString().split('T')[0];
  const stmts = cards.map(c => new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO balance_snapshots (user_id, card_id, date, balance)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(card_id, date) DO UPDATE SET balance = excluded.balance`,
      [userId, c.id, date, c.balance],
      err => err ? reject(err) : resolve()
    );
  }));
  return Promise.all(stmts);
}

function loadSnapshots(db, userId, sinceDate) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT card_id, date, balance FROM balance_snapshots
       WHERE user_id = ? AND date >= ? ORDER BY date ASC`,
      [userId, sinceDate],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

module.exports = { recordSnapshots, loadSnapshots };
