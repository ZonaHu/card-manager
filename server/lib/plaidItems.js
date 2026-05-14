// server/lib/plaidItems.js
//
// CRUD around the plaid_items table. Routes use this instead of touching the
// columns directly so we stay consistent (e.g., always stamping
// last_sync_attempt_at on every attempt, success or failure).

function upsertItem(db, userId, { item_id, institution_name, access_token }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO plaid_items (user_id, item_id, institution_name, access_token)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, item_id) DO UPDATE SET
         institution_name = excluded.institution_name,
         access_token = excluded.access_token`,
      [userId, item_id, institution_name, access_token],
      function (err) {
        if (err) return reject(err);
        if (this.lastID) return resolve(this.lastID);
        db.get('SELECT id FROM plaid_items WHERE user_id=? AND item_id=?',
          [userId, item_id], (e, row) => e ? reject(e) : resolve(row && row.id));
      }
    );
  });
}

function loadItemsForUser(db, userId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM plaid_items WHERE user_id = ? ORDER BY id', [userId],
      (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

function loadItemByPk(db, pk) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM plaid_items WHERE id = ?', [pk],
      (err, row) => err ? reject(err) : resolve(row));
  });
}

function updateCursor(db, itemPk, cursor) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE plaid_items SET sync_cursor = ? WHERE id = ?',
      [cursor, itemPk], err => err ? reject(err) : resolve());
  });
}

function recordItemSyncSuccess(db, itemPk) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE plaid_items
       SET last_synced_at = CURRENT_TIMESTAMP,
           last_sync_attempt_at = CURRENT_TIMESTAMP,
           last_sync_error = NULL
       WHERE id = ?`,
      [itemPk], err => err ? reject(err) : resolve());
  });
}

function recordItemSyncFailure(db, itemPk, errorMsg) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE plaid_items
       SET last_sync_attempt_at = CURRENT_TIMESTAMP,
           last_sync_error = ?
       WHERE id = ?`,
      [errorMsg, itemPk], err => err ? reject(err) : resolve());
  });
}

function markItemReauth(db, itemPk, errorCode) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE plaid_items SET needs_reauth=1, reauth_error_code=? WHERE id=?',
      [errorCode, itemPk], err => err ? reject(err) : resolve());
  });
}

function clearItemReauth(db, itemPk) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE plaid_items SET needs_reauth=0, reauth_error_code=NULL WHERE id=?',
      [itemPk], err => err ? reject(err) : resolve());
  });
}

module.exports = {
  upsertItem, loadItemsForUser, loadItemByPk, updateCursor,
  recordItemSyncSuccess, recordItemSyncFailure, markItemReauth, clearItemReauth
};
