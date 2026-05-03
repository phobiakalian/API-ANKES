// api/index.js - Vercel serverless function entry
const { app, ensureDb } = require('../src/app');
const logger = require('../src/logger');

// Vercel serverless handler
module.exports = async (req, res) => {
  // Ensure DB is initialized (lazy load per cold start)
  try {
    await ensureDb();
  } catch (error) {
    logger.error('DB init failed in serverless:', error);
    return res.status(503).json({ error: 'Database connection failed' });
  }
  
  // Let Express handle the request
  return app(req, res);
};