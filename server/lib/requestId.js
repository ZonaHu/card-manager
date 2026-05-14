// server/lib/requestId.js
//
// Generates an X-Request-ID per request (or honors the incoming header).
// Sets res.locals.requestId so errors.js can include it in JSON responses
// and frontend toasts can display it for support.

const crypto = require('crypto');

function requestId(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const id = (typeof incoming === 'string' && incoming.length <= 64)
    ? incoming
    : crypto.randomBytes(8).toString('hex');
  res.locals.requestId = id;
  res.setHeader('X-Request-ID', id);
  next();
}

module.exports = { requestId };
