#!/usr/bin/env node
// One-shot migration: encrypt any Plaid access_token currently stored as plaintext.
//
// The runtime util at server/utils/crypto.js tolerates legacy plaintext on read
// for safety, but tokens should never sit in the database unencrypted. Run this
// script once after deploying the encryption change, or whenever new plaintext
// rows show up (it is idempotent and safe to re-run).
//
// Usage:
//   ENCRYPTION_KEY=<64-hex> node server/scripts/migrate-tokens.js
//   ENCRYPTION_KEY=<64-hex> node server/scripts/migrate-tokens.js --dry-run

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { encrypt, isEncrypted } = require('../utils/crypto');

const dryRun = process.argv.includes('--dry-run');
const dbPath = path.join(__dirname, '..', 'database.db');
const db = new sqlite3.Database(dbPath);

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  });
}
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

(async () => {
  try {
    const rows = await dbAll(
      `SELECT id, name, last_four, access_token FROM cards WHERE access_token IS NOT NULL`
    );
    const plaintext = rows.filter(r => !isEncrypted(r.access_token));

    console.log(`[migrate-tokens] total cards with tokens: ${rows.length}`);
    console.log(`[migrate-tokens] plaintext tokens to encrypt: ${plaintext.length}`);

    if (plaintext.length === 0) {
      console.log('[migrate-tokens] nothing to do');
      db.close();
      return;
    }

    for (const row of plaintext) {
      const encrypted = encrypt(row.access_token);
      const label = `card #${row.id} (${row.name} ••••${row.last_four})`;
      if (dryRun) {
        console.log(`[dry-run] would encrypt ${label}`);
      } else {
        await dbRun('UPDATE cards SET access_token = ? WHERE id = ?', [encrypted, row.id]);
        console.log(`encrypted ${label}`);
      }
    }
    console.log(dryRun ? '[migrate-tokens] dry run complete' : '[migrate-tokens] done');
    db.close();
  } catch (err) {
    console.error('[migrate-tokens] failed:', err);
    db.close();
    process.exit(1);
  }
})();
