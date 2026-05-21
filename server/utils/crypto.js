const crypto = require('crypto');

// AES-256-GCM authenticated encryption for sensitive column values (Plaid access tokens).
// Storage format: "enc:v1:<iv_hex>:<authtag_hex>:<ciphertext_hex>"
// The prefix lets us lazy-migrate legacy plaintext values: if a stored value lacks the prefix,
// we treat it as plaintext and re-encrypt it on next write.

const ENC_PREFIX = 'enc:v1:';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY env var is required. Generate one with: openssl rand -hex 32'
    );
  }
  // Expect 64 hex chars = 32 bytes.
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(raw, 'hex');
}

let cachedKey = null;
function key() {
  if (!cachedKey) cachedKey = getKey();
  return cachedKey;
}

function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${ct.toString('hex')}`;
}

function decrypt(stored) {
  if (stored === null || stored === undefined) return stored;
  if (typeof stored !== 'string' || !stored.startsWith(ENC_PREFIX)) {
    // Legacy plaintext row — return as-is. Will be re-encrypted on next write.
    return stored;
  }
  const parts = stored.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted value');
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function isEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith(ENC_PREFIX);
}

module.exports = { encrypt, decrypt, isEncrypted };
