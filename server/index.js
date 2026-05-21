// Production entrypoint. Opens the on-disk SQLite database, runs migrations,
// builds the Express app via the shared factory, and listens.
//
// Tests build the same app via app.js with an in-memory database — keep all
// behavior changes inside app.js so both paths stay aligned.

require('dotenv').config();
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const { runMigrations } = require('./utils/migrator');
const logger = require('./utils/logger');
const { makeApp } = require('./app');

const PORT = process.env.PORT || 3001;

// Refuse to start when any required secret is missing OR still set to the
// placeholder value shipped in .env.example. The placeholders are publicly
// known (in the repo), so accepting them would let anyone forge JWTs against
// the deployment.
const PLACEHOLDER_SECRETS = new Set([
  // Older placeholder shapes (pre-rewrite)
  'your-super-secret-jwt-key-here-change-this-in-production',
  'your-session-secret-here-change-this-too',
  'your-encryption-key-here-change-this-too',
  'change-me',
  // Current .env.example placeholder shapes — keep this list in sync if
  // .env.example is ever edited; otherwise the friendly error stops firing
  // and the user sees a less-helpful crypto/jwt-library error instead.
  'your-super-secret-jwt-key-change-this-in-production',
  'your-session-secret-change-this-in-production',
  'generate-a-64-char-hex-string-with-openssl-rand-hex-32'
]);
function requireSecret(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} env var is required. Set it in server/.env before starting the server.`);
  if (PLACEHOLDER_SECRETS.has(v)) {
    throw new Error(`${name} is still set to the placeholder shipped in .env.example. Rotate it before starting the server.`);
  }
  if (v.length < 16) {
    throw new Error(`${name} is too short (${v.length} chars). Use at least 16 characters of entropy.`);
  }
}
requireSecret('SESSION_SECRET');
requireSecret('JWT_SECRET');
// Fail fast if ENCRYPTION_KEY is missing or malformed.
require('./utils/crypto').encrypt('startup-check');

const db = new sqlite3.Database(path.join(__dirname, 'database.db'));

runMigrations(db)
  .then(() => {
    const app = makeApp(db);
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
  })
  .catch(err => {
    logger.error('migrator failed', { err: err && err.stack ? err.stack : String(err) });
    process.exit(1);
  });
