// src/cache.js - In-memory cache dengan TTL & LRU, safe untuk serverless
const logger = require('./logger');

// Config
const TTL = parseInt(process.env.CACHE_TTL_MS) || 5 * 60 * 1000; // 5 menit default
const MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE) || 500; // Maksimal item

// In Vercel serverless, cache resets per cold start - that's okay for our use case
const cache = new Map();

/**
 * Set value in cache with TTL
 */
function set(key, value) {
  // LRU: Jika penuh, hapus item paling lama
  if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
    logger.debug({ key: firstKey }, 'Cache evicted (LRU)');
  }
  
  cache.set(key, {
    value,
    expiry: Date.now() + TTL,
    createdAt: Date.now()
  });
  
  logger.debug({ key, size: cache.size }, 'Cache set');
}

/**
 * Get value from cache if not expired
 */
function get(key) {
  const item = cache.get(key);
  if (!item) {
    logger.debug({ key }, 'Cache miss');
    return null;
  }
  
  // Cek expired
  if (Date.now() > item.expiry) {
    cache.delete(key);
    logger.debug({ key }, 'Cache expired');
    return null;
  }
  
  // LRU touch: move to end
  cache.delete(key);
  cache.set(key, item);
  
  logger.debug({ key }, 'Cache hit');
  return item.value;
}

/**
 * Delete specific key
 */
function del(key) {
  const existed = cache.delete(key);
  logger.debug({ key, existed }, 'Cache delete');
  return existed;
}

/**
 * Clear all cache
 */
function clear() {
  const size = cache.size;
  cache.clear();
  logger.info({ size }, 'Cache cleared');
}

/**
 * Get cache stats (for monitoring)
 */
function getStats() {
  return {
    size: cache.size,
    maxSize: MAX_SIZE,
    ttlMs: TTL,
    keys: Array.from(cache.keys())
  };
}

module.exports = { set, get, del, clear, getStats };