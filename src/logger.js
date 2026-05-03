// src/logger.js - Structured logging dengan Pino
const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // Pretty print untuk development
  transport: process.env.NODE_ENV === 'development' || process.env.VERCEL 
    ? { 
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname'
        }
      } 
    : undefined,
  // Formatters untuk konsistensi
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  // Base fields untuk semua log
  base: {
    service: 'ankes-api',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  }
});

// Helper untuk log error dengan stack trace
logger.errorWithStack = (err, context = {}) => {
  logger.error({
    ...context,
    err: {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    }
  }, 'Error occurred');
};

module.exports = logger;