// src/resilience.js

const logger = require('./logger');

const RETRY_CONFIG = { retries: 3, minTimeout: 100, maxTimeout: 1000, factor: 2 };

async function withRetry(operation, label, config = {}) {
  const cfg = { ...RETRY_CONFIG, ...config };
  let lastError;
  
  for (let attempt = 1; attempt <= cfg.retries + 1; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      // Jangan retry error auth/permission (Permanent errors)
      if (err.code === 7 || err.code === 10 || err.code === 403) throw err; 
      
      if (attempt <= cfg.retries) {
        const delay = Math.min(cfg.minTimeout * Math.pow(cfg.factor, attempt - 1), cfg.maxTimeout);
        logger.warn({ attempt, label, delay }, 'Retrying operation...');
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };

