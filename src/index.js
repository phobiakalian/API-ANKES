// src/index.js - Entry point untuk local development
const { app, ensureDb } = require('./app');
const logger = require('./logger');

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await ensureDb();
    
    app.listen(PORT, () => {
      logger.info(`🚀 Ankes API running on http://localhost:${PORT}`);
      logger.info(`🔑 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('👋 Shutting down gracefully...');
  process.exit(0);
});