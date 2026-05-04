// api/index.js - Minimal Vercel serverless handler
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Inisialisasi Firebase (lazy, hanya sekali)
let db;
async function getDb() {
  if (db) return db;
  
  if (!admin.apps.length) {
    // Coba parse dari env var JSON
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

// Trust proxy untuk Vercel (WAJIB untuk rate-limit)
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.NODE_ENV === 'production' ? (process.env.ALLOWED_ORIGINS?.split(',') || []) : true }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 100, message: { error: "Too many requests" } }));

// ✅ Health check TANPA Firebase dependency (selalu return 200)
app.get('/health', (req, res) => {
  res.json({ 
    status: "ok", 
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    firestore: "lazy-loaded", // Firebase akan di-init saat pertama kali dipanggil
    version: "1.0.0"
  });
});

// ✅ Endpoint analyze dengan lazy Firebase init
app.post('/v1/analyze', async (req, res) => {
  try {
    // Validasi API key
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
      return res.status(401).json({ error: "Invalid API Key" });
    }
    
    const { group_id, user_id, text } = req.body;
    if (!group_id || !user_id || !text) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Lazy-load Firebase hanya saat dibutuhkan
    const firestore = await getDb();
    
    // Cek whitelist (simplified)
    const whitelistDoc = await firestore.collection('whitelist').doc(user_id).get();
    if (whitelistDoc.exists && whitelistDoc.data().group_id === group_id) {
      return res.json({ is_gcast: false, score: 0.0, reason: ["whitelisted"], action: "allow" });
    }
    
    // Deteksi sederhana: link = spam
    const hasLink = /(https?:\/\/|t\.me\/|www\.)\S+/gi.test(text);
    if (hasLink) {
      return res.json({ is_gcast: true, score: 1.0, reason: ["contains_link"], action: "delete" });
    }
    
    // Default: allow
    return res.json({ is_gcast: false, score: 0.0, reason: ["clean"], action: "allow" });
    
  } catch (error) {
    console.error('Analyze error:', error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Export untuk Vercel
module.exports = async (req, res) => {
  try {
    return app(req, res);
  } catch (error) {
    console.error('Serverless error:', error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};