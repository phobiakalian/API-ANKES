const logger = require('./logger');

const TTL = parseInt(process.env.CACHE_TTL_MS) || 5 * 60 * 1000; // 5 menit default
const MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE) || 500;

const cache = new Map();

function set(key, value) {
  // Evict key tertua jika cache penuh (Simple LRU)
  if (cache.size >= MAX_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
  cache.set(key, { value, expiry: Date.now() + TTL });
}

function get(key) {
  const item = cache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function del(key) {
  cache.delete(key);
}

module.exports = { set, get, del };