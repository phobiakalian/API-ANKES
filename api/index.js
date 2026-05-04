// api/index.js - Vercel serverless function entry point
const { app, ensureDb } = require('../src/app');
const logger = require('../src/logger');

module.exports = async (req, res) => {
  const startTime = Date.now();
  
  try {
    // Lazy-load Firebase (penting untuk serverless cold start)
    await ensureDb();
    
    // Forward request ke Express app
    return app(req, res);
    
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error({
      path: req.path,
      method: req.method,
      duration_ms: duration,
      error: error.message
    }, 'Serverless function error');
    
    return res.status(500).json({ 
      error: process.env.NODE_ENV === 'production' 
        ? 'Internal server error' 
        : error.message 
    });
  }
};