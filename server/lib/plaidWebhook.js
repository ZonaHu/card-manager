// Plaid webhook verification.
//
// Two modes, picked via env:
//   PLAID_WEBHOOK_JWT_VERIFICATION=true → production-grade JWT signature
//     verification against keys served by Plaid's JWKS. The verification
//     header (Plaid-Verification) is itself a JWT signed with ES256 by Plaid;
//     its kid header points at the public key to use. We also verify a
//     request_body_sha256 claim matches the actual body hash, defeating
//     replay across endpoints, plus an iat freshness check.
//
//   else → shared-secret header check (PLAID_WEBHOOK_SECRET).
//     Simple but only works if you can rotate the secret server-side.
//
// Caches public keys in-memory by kid. Plaid rotates these rarely (~daily),
// but we expire after PLAID_WEBHOOK_KEY_CACHE_MS to be safe.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { plaidClient } = require('./plaid');

const MAX_IAT_AGE_SEC = 5 * 60;
const KEY_CACHE_MS = parseInt(process.env.PLAID_WEBHOOK_KEY_CACHE_MS, 10) || 60 * 60 * 1000;

const keyCache = new Map(); // kid -> { keyObject, fetchedAt }

async function getVerificationKey(kid) {
  const cached = keyCache.get(kid);
  if (cached && Date.now() - cached.fetchedAt < KEY_CACHE_MS) {
    return cached.keyObject;
  }
  const resp = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const jwk = resp.data.key;
  if (!jwk) throw new Error(`Plaid did not return a JWK for kid=${kid}`);
  // Node's crypto can ingest a JWK directly and produce a KeyObject usable
  // by jsonwebtoken's verify.
  const keyObject = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  keyCache.set(kid, { keyObject, fetchedAt: Date.now() });
  return keyObject;
}

async function verifyJwtWebhook(headerToken, rawBody) {
  if (!headerToken) throw new Error('missing Plaid-Verification header');
  const decoded = jwt.decode(headerToken, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    throw new Error('malformed verification JWT');
  }
  if (decoded.header.alg !== 'ES256') {
    throw new Error(`unexpected JWT alg ${decoded.header.alg}`);
  }
  const key = await getVerificationKey(decoded.header.kid);

  let payload;
  try {
    payload = jwt.verify(headerToken, key, { algorithms: ['ES256'] });
  } catch (e) {
    throw new Error(`JWT verify failed: ${e.message}`);
  }
  if (!payload || typeof payload.iat !== 'number') {
    throw new Error('missing iat claim');
  }
  const ageSec = Math.floor(Date.now() / 1000) - payload.iat;
  if (ageSec > MAX_IAT_AGE_SEC) {
    throw new Error('webhook too old (replay?)');
  }
  if (typeof payload.request_body_sha256 !== 'string') {
    throw new Error('missing request_body_sha256 claim');
  }
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  // Constant-time compare to avoid timing leaks on the hex string.
  const a = Buffer.from(bodyHash);
  const b = Buffer.from(payload.request_body_sha256);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error('body hash mismatch');
  }
  return true;
}

// Returns true if verification passed (or was bypassed in disabled mode); false
// if it failed and the request should be rejected. Logs internally.
async function verifyPlaidWebhook(req, rawBody) {
  const useJwt = String(process.env.PLAID_WEBHOOK_JWT_VERIFICATION || '').toLowerCase() === 'true';
  if (useJwt) {
    try {
      const header = req.headers['plaid-verification'];
      await verifyJwtWebhook(header, rawBody);
      return true;
    } catch (e) {
      logger.warn('plaid webhook JWT verify failed', { err: e && e.message });
      return false;
    }
  }
  // Shared-secret fallback.
  const expected = process.env.PLAID_WEBHOOK_SECRET;
  if (!expected) {
    // Dev convenience only — fail closed in production so a missed env var
    // doesn't silently leave the webhook open to anyone on the internet.
    if (process.env.NODE_ENV === 'production') {
      logger.error('refusing webhook: neither PLAID_WEBHOOK_JWT_VERIFICATION nor PLAID_WEBHOOK_SECRET configured in production');
      return false;
    }
    logger.warn('PLAID_WEBHOOK_SECRET unset; accepting webhook unverified (dev only)');
    return true;
  }
  const provided = req.headers['x-plaid-verification'] || req.headers['plaid-verification'];
  if (provided !== expected) {
    logger.warn('plaid webhook bad shared secret');
    return false;
  }
  return true;
}

module.exports = { verifyPlaidWebhook };
