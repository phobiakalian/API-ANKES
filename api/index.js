const { app } = require('../src/app');
const logger = require('../src/logger');

// Handler untuk Vercel
module.exports = async (req, res) => {
  // Timeout protection (Vercel max execution 10s for Hobby, 60s for Pro)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      logger.error({ url: req.url }, 'Vercel Function Timeout');
      res.status(504).json({ success: false, error: "Gateway Timeout" });
    }
  }, 55000); // Set 55s (aman)

  try {
    // Jalankan aplikasi Express
    await app(req, res);
  } catch (error) {
    logger.error({ err: error, url: req.url }, 'Unhandled Vercel Error');
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        error: "Internal Server Error",
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } finally {
    clearTimeout(timeout);
  }
};