// api/index.js - Vercel serverless entry (FINAL FIX)
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import routes dari src/routes.js
const routes = require('../src/routes');

// Firebase lazy init
let db;
async function getDb() {
  if (db) return db;
  
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } else {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not set');
    }
  }
  
  db = admin.firestore();
  db.settings({ ignoreUndefinedProperties: true, preferRest: true });
  return db;
}

const app = express();

// 🛡️ PENTING: Trust proxy HARUS sebelum rate-limit!
// Ini fix untuk error "X-Forwarded-For header is set but trust proxy is false"
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({ 
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS?.split(',') || []) 
    : true 
}));
app.use(express.json({ limit: '1mb' }));

// Rate limiter (sekarang aman karena trust proxy sudah true)
app.use(rateLimit({ 
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: { error: "Too many requests" },
  standardHeaders: true,
  legacyHeaders: false,
}));

// ✅ Import routes dari src/routes.js (semua endpoint /v1/*)
app.use('/v1', routes);

// Health check (tanpa Firebase dependency - selalu return 200)
app.get('/health', (req, res) => {
  res.json({ 
    status: "ok", 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    firestore: "lazy-loaded",
    version: "1.0.0",
    environment: process.env.NODE_ENV
  });
});

// API Index
app.get('/v1', (req, res) => {
  res.json({
    name: "Ankes Antigcast API",
    version: "1.0.0",
    endpoints: {
      "GET /health": "Health check",
      "GET /v1": "API index",
      "POST /v1/analyze": "Analyze message",
      "POST /v1/config/:group_id": "Update config",
      "GET /v1/stats/:group_id": "Get stats",
      "GET /v1/summary/:group_id": "Get summary",
      "POST /v1/whitelist/:group_id/:user_id": "Add to whitelist",
      "DELETE /v1/whitelist/:group_id/:user_id": "Remove from whitelist",
      "POST /v1/blacklist/:group_id": "Add to blacklist",
      "DELETE /v1/blacklist/:group_id": "Remove from blacklist",
      "GET /v1/blacklist/:group_id": "Get blacklist"
    }
  });
});

// 404 handler (PALING BAWAH - setelah semua routes)
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler global (tangkap semua error unhandled)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  console.error('Stack:', err.stack);
  res.status(500).json({ 
    error: process.env.NODE_ENV === 'production' ? "Internal server error" : err.message 
  });
});

// Export untuk Vercel serverless
module.exports = async (req, res) => {
  try {
    return app(req, res);
  } catch (error) {
    console.error('Serverless handler error:', error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};