// src/index.js
const { app } = require('./app');
const logger = require('./logger');
const { getDb } = require('./db');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Pre-connect database untuk local dev
    await getDb();
    logger.info('✅ Database connected');
    
    app.listen(PORT, () => {
      logger.info(`🚀 Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

