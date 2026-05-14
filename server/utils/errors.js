const crypto = require('crypto');
const logger = require('./logger');

// Centralized error handling that logs internals server-side with a requestId
// and returns a generic error body to the client. Prevents leakage of DB errors,
// Plaid response bodies, stack traces, etc.

function newRequestId() {
  return crypto.randomBytes(8).toString('hex');
}

function sendServerError(res, err, publicMessage = 'Server error', status = 500) {
  const requestId = (res.locals && res.locals.requestId) || newRequestId();
  logger.error(publicMessage, {
    requestId,
    err: err && err.stack ? err.stack : String(err),
    upstream: err && err.response && err.response.data
  });
  res.status(status).json({ error: publicMessage, requestId });
}

function sendClientError(res, publicMessage, status = 400, extra) {
  const body = { error: publicMessage };
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  res.status(status).json(body);
}

module.exports = { sendServerError, sendClientError, newRequestId };
