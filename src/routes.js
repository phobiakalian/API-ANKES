const express = require('express');
const router = express.Router();
const { getDb, admin } = require('./db');
const { analyzeAsciiPattern } = require('./detector');
const { verifyApiKey, validate, analyzeSchema, configSchema } = require('./middleware');
const cache = require('./cache');
const logger = require('./logger');
const { withRetry } = require('./resilience');

// ============================================================================
// POST /v1/analyze - Analisis pesan masuk (Optimized + Resilient + Smart Logging)
// ============================================================================
router.post('/analyze', verifyApiKey, validate(analyzeSchema), async (req, res) => {
  const startTime = Date.now();
  
  try {
    const db = getDb();
    const { group_id, user_id, text } = req.validatedBody;

    // 1. Cek whitelist dulu (Paling ringan, cegah proses berat)
    const whitelistDoc = await withRetry(
      () => db.collection('whitelist').doc(user_id).get(),
      'whitelist_check'
    );
    
    if (whitelistDoc.exists && whitelistDoc.data().group_id === group_id) {
      logger.info({ group_id, user_id, result: 'whitelisted' }, 'Message whitelisted');
      return res.json({ is_gcast: false, score: 0.0, reason: ["whitelisted"], action: "allow" });
    }

    // 2. Ambil Config & Blacklist dari Cache atau DB
    const configKey = `config:${group_id}`;
    const blacklistKey = `blacklist:${group_id}`;
    
    let config = cache.get(configKey);
    let blacklist = cache.get(blacklistKey);

    if (!config || !blacklist) {
      logger.debug({ group_id }, 'Cache miss - fetching from Firestore');
      
      // Fetch dari Firestore secara paralel dengan retry
      const [configDoc, blacklistDoc] = await Promise.all([
        withRetry(() => db.collection('configs').doc(group_id).get(), 'config_fetch'),
        withRetry(() => db.collection('blacklists').doc(group_id).get(), 'blacklist_fetch')
      ]);
      
      config = configDoc.exists ? configDoc.data() : { threshold: 0.65, expert_mode: false };
      blacklist = blacklistDoc.exists ? (blacklistDoc.data().words || []) : [];
      
      // Simpan ke cache untuk request berikutnya
      cache.set(configKey, config);
      cache.set(blacklistKey, blacklist);
    }
    
    // 3. Jalankan deteksi
    const result = analyzeAsciiPattern(text, config.threshold, config.expert_mode, blacklist);

    // 4. 🧠 SMART LOGGING: Hemat database!
    const hasLink = result.reason?.includes('contains_link');
    const shouldLog = result.is_gcast || hasLink || Math.random() < 0.1;

    if (shouldLog) {
      const logText = text.length > 200 ? text.substring(0, 200) + '...' : text;
      
      // Fire-and-forget: tidak blocking response utama
      db.collection('logs').add({
        group_id,
        user_id,
        text: logText,
        is_gcast: result.is_gcast,
        score: result.score,
        reason: result.reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(err => logger.error({ err, group_id }, 'Log save error'));
    }

    const duration = Date.now() - startTime;
    logger.info({
      group_id,
      user_id,
      is_gcast: result.is_gcast,
      score: result.score,
      duration_ms: duration
    }, 'Message analyzed');

    return res.json(result);

  } catch (err) {
    logger.errorWithStack(err, { group_id: req.body?.group_id, user_id: req.body?.user_id });
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// POST /v1/config/:group_id - Update konfigurasi grup
// ============================================================================
router.post('/config/:group_id', verifyApiKey, validate(configSchema), async (req, res) => {
  try {
    const db = getDb();
    const update = Object.fromEntries(
      Object.entries(req.validatedBody).filter(([_, v]) => v !== undefined)
    );
    
    await withRetry(
      () => db.collection('configs').doc(req.params.group_id).set(
        { ...update, group_id: req.params.group_id, updated_at: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      ),
      'config_update'
    );
    
    // 🗑️ INVALIDATE CACHE agar perubahan langsung berlaku
    cache.del(`config:${req.params.group_id}`);
    
    logger.info({ group_id: req.params.group_id, update }, 'Config updated');
    res.json({ status: "config_updated", group_id: req.params.group_id });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// WHITELIST ENDPOINTS
// ============================================================================

// POST /v1/whitelist/:group_id/:user_id
router.post('/whitelist/:group_id/:user_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    await withRetry(
      () => db.collection('whitelist').doc(req.params.user_id).set(
        { 
          group_id: req.params.group_id, 
          user_id: req.params.user_id,
          added_at: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      ),
      'whitelist_add'
    );
    
    logger.info({ group_id: req.params.group_id, user_id: req.params.user_id }, 'User whitelisted');
    res.json({ status: "whitelisted" });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id, user_id: req.params.user_id });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /v1/whitelist/:group_id/:user_id
router.delete('/whitelist/:group_id/:user_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    await withRetry(
      () => db.collection('whitelist').doc(req.params.user_id).delete(),
      'whitelist_delete'
    );
    
    logger.info({ group_id: req.params.group_id, user_id: req.params.user_id }, 'User removed from whitelist');
    res.json({ status: "removed" });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id, user_id: req.params.user_id });
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// BLACKLIST ENDPOINTS
// ============================================================================

// POST /v1/blacklist/:group_id - Tambah kata ke blacklist
router.post('/blacklist/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const { word } = req.body;
    
    // Validasi input
    if (!word || typeof word !== 'string' || word.length < 2) {
      return res.status(400).json({ error: "Word must be at least 2 characters" });
    }
    
    const groupId = req.params.group_id;
    
    // Gunakan arrayUnion agar kata unik & tidak duplikat
    await withRetry(
      () => db.collection('blacklists').doc(groupId).set({
        group_id: groupId,
        words: admin.firestore.FieldValue.arrayUnion(word.toLowerCase()),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true }),
      'blacklist_add'
    );
    
    // 🗑️ INVALIDATE CACHE agar perubahan langsung berlaku
    cache.del(`blacklist:${groupId}`);
    
    logger.info({ group_id: groupId, word }, 'Word added to blacklist');
    res.json({ status: "added", word: word.toLowerCase(), group_id: groupId });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id, word: req.body?.word });
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /v1/blacklist/:group_id - Hapus kata dari blacklist
router.delete('/blacklist/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const { word } = req.body;
    
    if (!word) {
      return res.status(400).json({ error: "Word is required" });
    }
    
    const groupId = req.params.group_id;
    
    // Gunakan arrayRemove untuk menghapus dari array
    await withRetry(
      () => db.collection('blacklists').doc(groupId).update({
        words: admin.firestore.FieldValue.arrayRemove(word.toLowerCase()),
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      }),
      'blacklist_delete'
    );
    
    // 🗑️ INVALIDATE CACHE
    cache.del(`blacklist:${groupId}`);
    
    logger.info({ group_id: groupId, word }, 'Word removed from blacklist');
    res.json({ status: "removed", word: word.toLowerCase(), group_id: groupId });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id, word: req.body?.word });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /v1/blacklist/:group_id - Lihat daftar blacklist
router.get('/blacklist/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const doc = await withRetry(
      () => db.collection('blacklists').doc(req.params.group_id).get(),
      'blacklist_get'
    );
    
    if (!doc.exists) {
      return res.json({ group_id: req.params.group_id, words: [] });
    }
    
    res.json({ 
      group_id: req.params.group_id, 
      words: doc.data().words || [],
      updated_at: doc.data().updated_at
    });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id });
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============================================================================
// GET /v1/summary/:group_id - Lightweight group summary (NEW)
// ============================================================================
router.get('/summary/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const groupId = req.params.group_id;
    
    // Ambil config dari cache atau DB
    const configKey = `config:${groupId}`;
    let config = cache.get(configKey);
    
    if (!config) {
      const configDoc = await withRetry(
        () => db.collection('configs').doc(groupId).get(),
        'config_fetch_summary'
      );
      config = configDoc.exists ? configDoc.data() : {};
      cache.set(configKey, config);
    }
    
    // Ambil blacklist count (cached)
    const blacklistKey = `blacklist:${groupId}`;
    let blacklist = cache.get(blacklistKey);
    
    if (!blacklist) {
      const blacklistDoc = await withRetry(
        () => db.collection('blacklists').doc(groupId).get(),
        'blacklist_fetch_summary'
      );
      blacklist = blacklistDoc.exists ? (blacklistDoc.data().words || []) : [];
      cache.set(blacklistKey, blacklist);
    }
    
    res.json({
      group_id: groupId,
      protection_enabled: !config.disabled,
      threshold: config.threshold || 0.65,
      expert_mode: config.expert_mode || false,
      blacklist_count: blacklist.length,
      last_updated: config.updated_at || null
    });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id });
    res.status(500).json({ error: "Internal error" });
  }
});

// ============================================================================
// GET /v1/stats/:group_id - Statistik gcast per grup
// ============================================================================
router.get('/stats/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const { group_id } = req.params;
    
    const { days = 7, limit = 10 } = req.query;
    const daysNum = parseInt(days) || 7;
    const limitNum = parseInt(limit) || 10;
    
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNum);
    
    // Query logs dengan index composite (pastikan index sudah dibuat di Firebase Console)
    const logsSnapshot = await withRetry(
      () => db.collection('logs')
        .where('group_id', '==', group_id)
        .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(fromDate))
        .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(toDate))
        .orderBy('timestamp', 'desc')
        .limit(1000) 
        .get(),
      'stats_query'
    );
    
    if (logsSnapshot.empty) {
      return res.json({
        group_id,
        period: { from: fromDate.toISOString(), to: toDate.toISOString() },
        summary: { total_messages: 0, gcast_detected: 0, gcast_allowed: 0, block_rate: 0 },
        top_reasons: [],
        recent_logs: [],
        message: "No logs found for this period"
      });
    }
    
    let totalMessages = 0;
    let gcastDetected = 0;
    const reasonCounts = {};
    const recentLogs = [];
    
    logsSnapshot.forEach(doc => {
      const log = doc.data();
      totalMessages++;
      
      if (log.is_gcast) {
        gcastDetected++;
        if (Array.isArray(log.reason)) {
          log.reason.forEach(r => {
            reasonCounts[r] = (reasonCounts[r] || 0) + 1;
          });
        }
      }
      
      if (recentLogs.length < limitNum) {
        recentLogs.push({
          timestamp: log.timestamp?.toDate?.() || log.timestamp,
          user_id: log.user_id,
          text: log.text,
          is_gcast: log.is_gcast,
          score: log.score,
          action: log.action
        });
      }
    });
    
    const gcastAllowed = totalMessages - gcastDetected;
    const blockRate = totalMessages > 0 
      ? parseFloat(((gcastDetected / totalMessages) * 100).toFixed(2)) 
      : 0;
    
    const topReasons = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    res.json({
      group_id,
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      summary: {
        total_messages: totalMessages,
        gcast_detected: gcastDetected,
        gcast_allowed: gcastAllowed,
        block_rate: blockRate
      },
      top_reasons: topReasons,
      recent_logs: recentLogs
    });
    
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id });
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;