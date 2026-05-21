const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Lightweight SQLite migrator. Each file in server/migrations/ is named
// NNN_description.js and exports `async up(db)`. Versions are tracked in
// the schema_migrations table. Migrations run in lexical order.
//
// We avoid using better-sqlite3 here; the rest of the codebase uses the
// callback-based sqlite3 API, so we wrap db.run/get/all in promises.

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  });
}

async function ensureMigrationsTable(db) {
  await dbRun(db,
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY,
       name TEXT NOT NULL,
       applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
     )`
  );
}

async function getAppliedVersions(db) {
  const rows = await new Promise((resolve, reject) => {
    db.all('SELECT version FROM schema_migrations ORDER BY version', [], (err, r) =>
      err ? reject(err) : resolve(r));
  });
  return new Set(rows.map(r => r.version));
}

function loadMigrationFiles() {
  const dir = path.join(__dirname, '..', 'migrations');
  return fs.readdirSync(dir)
    .filter(f => /^\d+_.+\.js$/.test(f))
    .sort()
    .map(f => {
      const match = f.match(/^(\d+)_(.+)\.js$/);
      const version = parseInt(match[1], 10);
      const name = match[2];
      const mod = require(path.join(dir, f));
      if (typeof mod.up !== 'function') {
        throw new Error(`Migration ${f} missing exported up(db)`);
      }
      return { version, name, file: f, up: mod.up };
    });
}

async function runMigrations(db) {
  await ensureMigrationsTable(db);
  const applied = await getAppliedVersions(db);
  const migrations = loadMigrationFiles();
  // Bind the helpers to the open db so each migration can call
  //   await dbRun('CREATE TABLE ...')
  // without remembering to pass the connection every time.
  const boundDbRun = (sql, params = []) => dbRun(db, sql, params);
  const boundDbGet = (sql, params = []) => dbGet(db, sql, params);

  let ran = 0;
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    logger.info(`applying migration ${m.file}`);
    await m.up(db, { dbRun: boundDbRun, dbGet: boundDbGet });
    await dbRun(db, 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
    ran++;
  }
  if (ran === 0) {
    logger.info('schema up to date');
  } else {
    logger.info(`applied ${ran} migration(s)`);
  }
}

module.exports = { runMigrations, dbRun, dbGet };
