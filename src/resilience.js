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
      if (err.code === 7 || err.code === 10) throw err; // Permanent errors
      if (attempt <= cfg.retries) {
        const delay = Math.min(cfg.minTimeout * Math.pow(cfg.factor, attempt - 1), cfg.maxTimeout);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };