// src/app.js - Express app definition (reusable untuk local & Vercel)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
const { getDb } = require('./db');
const logger = require('./logger');

const app = express();

// Inisialisasi Firebase (lazy load untuk Vercel)
let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    try {
      await getDb();
      logger.info('✅ Firebase Firestore connected');
      dbInitialized = true;
    } catch (e) {
      logger.error('❌ Firebase init failed:', e.message);
      throw e;
    }
  }
}

// Middleware keamanan & parsing
app.use(helmet());
app.use(cors({ 
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS?.split(',') || []) 
    : true 
}));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ 
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
}));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      ip: req.ip
    }, 'HTTP request completed');
  });
  next();
});

// Routing API
app.use('/v1', routes);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await ensureDb();
    await getDb().collection('_health_check').doc('ping').set({
      timestamp: require('firebase-admin').firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    res.json({ 
      status: "ok", 
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      firestore: "connected",
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV
    });
  } catch (e) {
    logger.error('Health check failed:', e);
    res.status(503).json({ 
      status: "degraded", 
      error: "Firestore connection failed",
      uptime: process.uptime()
    });
  }
});

// API Index
app.get('/v1', (req, res) => {
  res.json({
    name: "Ankes Antigcast API",
    version: process.env.npm_package_version || "1.0.0",
    description: "API untuk deteksi dan moderasi spam/gcast di Telegram",
    endpoints: {
      "POST /v1/analyze": "Analyze message for gcast detection",
      "POST /v1/config/:group_id": "Update group configuration",
      "POST /v1/whitelist/:group_id/:user_id": "Add user to whitelist",
      "DELETE /v1/whitelist/:group_id/:user_id": "Remove user from whitelist",
      "GET /v1/stats/:group_id": "Get gcast statistics for a group",
      "GET /v1/summary/:group_id": "Get lightweight group summary",
      "GET /v1/blacklist/:group_id": "Get group blacklist",
      "GET /health": "Health check endpoint"
    },
    docs: "https://github.com/yourusername/ankes-api",
    license: "MIT"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler global
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' 
      ? "Internal server error" 
      : err.message 
  });
});

module.exports = { app, ensureDb };