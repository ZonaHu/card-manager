// server/lib/requestId.js
//
// Generates an X-Request-ID per request (or honors the incoming header).
// Sets res.locals.requestId so errors.js can include it in JSON responses
// and frontend toasts can display it for support.

const crypto = require('crypto');

// Restrict to a safe ASCII subset so an attacker can't smuggle CRLF, control
// chars, or quotes into log lines or response headers via the inbound header.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming))
    ? incoming
    : crypto.randomBytes(8).toString('hex');
  res.locals.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { requestId };
