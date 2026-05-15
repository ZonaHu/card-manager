// server/migrations/014_encrypt_legacy_tokens.js
//
// Backfill: any row in `cards` or `plaid_items` that still has an unencrypted
// `access_token` (no `enc:v1:` prefix) gets encrypted in place. Without this,
// legacy plaintext tokens persist forever — the decrypt() helper lazily
// passes them through on read but nothing forces a write, so they never
// get upgraded.

const { encrypt, isEncrypted } = require('../utils/crypto');

function allRows(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}
function run(db, sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

async function upgradeTable(db, table) {
  let upgraded = 0;
  const rows = await allRows(db, `SELECT id, access_token FROM ${table} WHERE access_token IS NOT NULL`);
  for (const row of rows) {
    if (isEncrypted(row.access_token)) continue;
    const encrypted = encrypt(row.access_token);
    await run(db, `UPDATE ${table} SET access_token = ? WHERE id = ?`, [encrypted, row.id]);
    upgraded++;
  }
  return upgraded;
}

exports.up = async (db) => {
  // Migration 008 introduced plaid_items.access_token. Migration 010+ added
  // the encryption layer. Anything inserted before that lives plaintext until
  // we touch it here.
  let total = 0;
  total += await upgradeTable(db, 'cards');
  // plaid_items might not exist on very old databases; guard.
  const tables = await allRows(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='plaid_items'");
  if (tables.length > 0) {
    total += await upgradeTable(db, 'plaid_items');
  }
  if (total > 0) {
    // eslint-disable-next-line no-console
    console.log(`[migration 014] encrypted ${total} legacy plaintext token(s)`);
  }
};
