// src/logger.js
const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

const transportConfig = !isProduction && !isVercel
  ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss Z' } }
  : undefined;

const logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  transport: transportConfig,
  formatters: { level: (label) => ({ level: label.toUpperCase() }) },
  base: { service: 'ankes-api', version: '1.0.0', environment: process.env.NODE_ENV || 'development' },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'msg'
});

logger.errorWithStack = (err, context = {}) => {
  logger.error({ ...context, err: { message: err.message, stack: err.stack, name: err.name, code: err.code } }, 'Error occurred');
};

module.exports = logger;