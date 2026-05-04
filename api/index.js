// api/index.js - Minimal Vercel serverless handler (FIXED)
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Inisialisasi Firebase (lazy, hanya sekali per cold start)
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

// 🛡️ PENTING: Trust proxy untuk Vercel (WAJIB sebelum rate-limit)
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
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
}));

// ============================================================================
// ROUTES (Inline untuk serverless - lebih reliable)
// ============================================================================

// ✅ Health check (tanpa Firebase dependency)
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

// ✅ API Index
app.get('/v1', (req, res) => {
  res.json({
    name: "Ankes Antigcast API",
    version: "1.0.0",
    endpoints: {
      "GET /health": "Health check",
      "GET /v1": "API index",
      "POST /v1/analyze": "Analyze message",
      "POST /v1/blacklist/:group_id": "Add word to blacklist",
      "DELETE /v1/blacklist/:group_id": "Remove word from blacklist",
      "GET /v1/blacklist/:group_id": "Get blacklist"
    }
  });
});

// ✅ POST /v1/analyze - Deteksi spam
app.post('/v1/analyze', async (req, res) => {
  try {
    // Validasi API key
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
      return res.status(401).json({ error: "Invalid API Key" });
    }
    
    const { group_id, user_id, text } = req.body;
    if (!group_id || !user_id || !text) {
      return res.status(400).json({ error: "Missing required fields: group_id, user_id, text" });
    }
    
    // Lazy-load Firebase
    const firestore = await getDb();
    
    // Cek whitelist
    const whitelistDoc = await firestore.collection('whitelist').doc(user_id).get();
    if (whitelistDoc.exists && whitelistDoc.data().group_id === group_id) {
      return res.json({ is_gcast: false, score: 0.0, reason: ["whitelisted"], action: "allow" });
    }
    
    // Deteksi: link = spam
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

// ✅ POST /v1/blacklist/:group_id - Tambah kata ke blacklist
app.post('/v1/blacklist/:group_id', async (req, res) => {
  try {
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
      return res.status(401).json({ error: "Invalid API Key" });
    }
    
    const { word } = req.body;
    const groupId = req.params.group_id;
    
    if (!word || word.length < 2) {
      return res.status(400).json({ error: "Word must be at least 2 characters" });
    }
    
    const firestore = await getDb();
    await firestore.collection('blacklists').doc(groupId).set({
      group_id: groupId,
      words: admin.firestore.FieldValue.arrayUnion(word.toLowerCase()),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    res.json({ status: "added", word: word.toLowerCase(), group_id: groupId });
  } catch (error) {
    console.error('Blacklist add error:', error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ DELETE /v1/blacklist/:group_id - Hapus kata dari blacklist
app.delete('/v1/blacklist/:group_id', async (req, res) => {
  try {
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
      return res.status(401).json({ error: "Invalid API Key" });
    }
    
    const { word } = req.body;
    const groupId = req.params.group_id;
    
    if (!word) {
      return res.status(400).json({ error: "Word is required" });
    }
    
    const firestore = await getDb();
    await firestore.collection('blacklists').doc(groupId).update({
      words: admin.firestore.FieldValue.arrayRemove(word.toLowerCase()),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
    
    res.json({ status: "removed", word: word.toLowerCase(), group_id: groupId });
  } catch (error) {
    console.error('Blacklist delete error:', error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /v1/blacklist/:group_id - Lihat blacklist
app.get('/v1/blacklist/:group_id', async (req, res) => {
  try {
    if (req.headers['x-api-key'] !== process.env.API_KEY) {
      return res.status(401).json({ error: "Invalid API Key" });
    }
    
    const groupId = req.params.group_id;
    const firestore = await getDb();
    const doc = await firestore.collection('blacklists').doc(groupId).get();
    
    if (!doc.exists) {
      return res.json({ group_id: groupId, words: [] });
    }
    
    res.json({ 
      group_id: groupId, 
      words: doc.data().words || [],
      updated_at: doc.data().updated_at
    });
  } catch (error) {
    console.error('Blacklist get error:', error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 404 handler (harus PALING BAWAH)
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// ============================================================================
// EXPORT UNTUK VERCEL SERVERLESS
// ============================================================================
module.exports = async (req, res) => {
  // Express sudah handle routing, kita cuma forward
  return app(req, res);
};