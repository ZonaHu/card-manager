const winston = require('winston');

// Single shared logger. Pretty-prints in dev for readability; emits JSON in
// production so log aggregators (ELK, Datadog, etc.) can parse fields directly.
//
// Levels (in increasing severity): debug, info, warn, error.
// Set LOG_LEVEL=debug to see chatty boot/sync diagnostics; default 'info' is
// quiet enough to leave on in production.

const isProd = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProd ? 'info' : 'debug');

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level: lvl, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${lvl} ${message}${metaStr}`;
  })
);

const prodFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level,
  format: isProd ? prodFormat : devFormat,
  transports: [new winston.transports.Console()]
});

module.exports = logger;
