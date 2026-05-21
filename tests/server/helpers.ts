// Shared setup for HTTP route tests. Each test file calls buildTestApp() to
// get a fresh app + in-memory SQLite database, fully migrated.

import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);

// Required env vars must be set BEFORE any server module is loaded, since
// lib/auth.js throws on missing JWT_SECRET at module-load time.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-32-bytes-padding-x';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

const sqlite3 = require_('sqlite3').verbose();
const { runMigrations } = require_('../../server/utils/migrator');
const { makeApp } = require_('../../server/app');

export async function buildTestApp() {
  const db = new sqlite3.Database(':memory:');
  await runMigrations(db);
  const app = makeApp(db, { disableRateLimit: true });
  return { app, db };
}
