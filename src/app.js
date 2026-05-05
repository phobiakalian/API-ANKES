// src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const logger = require('./logger');
const { addRequestId } = require('./middleware');
const { sendError } = require('./utils/response');

const app = express();

// 1. Trust Proxy (Vercel Requirement)
app.set('trust proxy', 1);

// 2. Middleware
app.use(helmet());
app.use(cors({ 
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS?.split(',') || []) 
    : true 
}));
app.use(express.json({ limit: '1mb' }));
app.use(addRequestId); // Tambah Request ID

// 3. Rate Limit
app.use(rateLimit({ 
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
}));

// 4. Request Logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      reqId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip
    }, 'HTTP Request');
  });
  next();
});

// 5. Routes
app.use('/v1', routes);

// 6. Health Check
app.get('/health', (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// 7. 404 Handler
app.use((req, res) => {
  return sendError(res, "Endpoint not found", 404);
});

// 8. Global Error Handler
app.use((err, req, res, next) => {
  logger.errorWithStack(err, { path: req.path });
  if (!res.headersSent) {
    return sendError(res, process.env.NODE_ENV === 'production' ? "Internal server error" : err.message, 500);
  }
});

module.exports = { app };

