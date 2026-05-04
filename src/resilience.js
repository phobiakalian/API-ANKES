// src/resilience.js - Retry logic & circuit breaker patterns
const logger = require('./logger');

const RETRY_CONFIG = {
  retries: 3,
  minTimeout: 100,
  maxTimeout: 1000,
  factor: 2,
  onRetry: (err, attempt) => {
    logger.warn({ err, attempt }, `Retrying operation (attempt ${attempt})`);
  }
};

async function withRetry(operation, label, config = {}) {
  const cfg = { ...RETRY_CONFIG, ...config };
  let lastError;
  
  for (let attempt = 1; attempt <= cfg.retries + 1; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      
      if (err.code === 7) {
        logger.error({ err, label }, 'Permanent error - not retrying');
        throw err;
      }
      if (err.code === 10) {
        logger.error({ err, label }, 'Aborted - not retrying');
        throw err;
      }
      
      if (attempt <= cfg.retries) {
        cfg.onRetry(err, attempt);
        const delay = Math.min(
          cfg.minTimeout * Math.pow(cfg.factor, attempt - 1),
          cfg.maxTimeout
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  logger.error({ err: lastError, label }, 'All retry attempts failed');
  throw lastError;
}

class CircuitBreaker {
  constructor(threshold = 5, timeout = 30000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailure = null;
    this.state = 'CLOSED';
  }
  
  async call(operation, label) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'HALF_OPEN';
        logger.info({ label }, 'Circuit breaker: attempting half-open');
      } else {
        throw new Error(`Circuit breaker OPEN for ${label}`);
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }
  
  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  onFailure() {
    this.failureCount++;
    this.lastFailure = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      logger.warn({ failures: this.failureCount }, 'Circuit breaker: OPEN');
    }
  }
  
  getStatus() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailure: this.lastFailure
    };
  }
}

const firestoreBreaker = new CircuitBreaker();

module.exports = {
  withRetry,
  CircuitBreaker,
  firestoreBreaker
};