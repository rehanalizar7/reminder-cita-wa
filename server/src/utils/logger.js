const pino = require('pino');

// Plain JSON logs — simplest thing that works reliably on a VPS via PM2
// (PM2 already captures stdout to its own log files, so no pretty-printer needed).
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});

module.exports = { logger };
