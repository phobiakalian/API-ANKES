const express = require('express');
const router = express.Router();
const { getDb, admin } = require('./db');
const { analyzeAsciiPattern } = require('./detector');
const { verifyApiKey, validate, analyzeSchema, configSchema } = require('./middleware');
const cache = require('./cache');
const logger = require('./logger');
const { withRetry } = require('./resilience');
const { sendSuccess, sendError } = require('./utils/response');

// POST /v1/analyze
router.post('/analyze', verifyApiKey, validate(analyzeSchema), async (req, res) => {
  const startTime = Date.now();
  const { group_id, user_id, text } = req.validatedBody;

  try {
    const db = getDb();

    // 1. Cek whitelist
    const whitelistDoc = await withRetry(
      () => db.collection('whitelist').doc(user_id).get(),
      'whitelist_check'
    );
    
    if (whitelistDoc.exists && whitelistDoc.data().group_id === group_id) {
      logger.info({ group_id, user_id }, 'Message whitelisted');
      return sendSuccess(res, { is_gcast: false, score: 0.0, reason: ["whitelisted"], action: "allow" });
    }

    // 2. Ambil Config & Blacklist (Parallel fetch + Cache)
    const configKey = `config:${group_id}`;
    const blacklistKey = `blacklist:${group_id}`;
    
    let [config, blacklist] = await Promise.all([
      cache.get(configKey) ? Promise.resolve(cache.get(configKey)) : 
        withRetry(() => db.collection('configs').doc(group_id).get(), 'config_fetch').then(doc => doc.exists ? doc.data() : { threshold: 0.65, expert_mode: false }),
      
      cache.get(blacklistKey) ? Promise.resolve(cache.get(blacklistKey)) : 
        withRetry(() => db.collection('blacklists').doc(group_id).get(), 'blacklist_fetch').then(doc => doc.exists ? (doc.data().words || []) : [])
    ]);

    if (!cache.get(configKey)) cache.set(configKey, config);
    if (!cache.get(blacklistKey)) cache.set(blacklistKey, blacklist);
    
    // 3. Deteksi
    const result = analyzeAsciiPattern(text, config.threshold, config.expert_mode, blacklist);

    // 4. Smart Logging (Non-blocking)
    const hasLink = result.reason?.includes('contains_link');
    const shouldLog = result.is_gcast || hasLink || Math.random() < 0.1;

    if (shouldLog) {
      const logText = text.length > 200 ? text.substring(0, 200) + '...' : text;
      db.collection('logs').add({
        group_id, user_id, text: logText, is_gcast: result.is_gcast,
        score: result.score, reason: result.reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(err => logger.error({ err }, 'Log save failed (non-critical)'));
    }

    logger.info({ group_id, user_id, score: result.score, duration_ms: Date.now() - startTime }, 'Analysis complete');
    return sendSuccess(res, result);

  } catch (err) {
    logger.errorWithStack(err, { group_id, user_id });
    return sendError(res, "Failed to analyze message");
  }
});

// GET /v1/stats/:group_id (DIPERBAIKI: Handle Missing Index)
router.get('/stats/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const { group_id } = req.params;
    const { days = 7 } = req.query;
    const daysNum = Math.min(parseInt(days) || 7, 30);

    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - daysNum);

    let logsSnapshot;
    try {
      logsSnapshot = await withRetry(
        () => db.collection('logs')
          .where('group_id', '==', group_id)
          .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(fromDate))
          .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(toDate))
          .orderBy('timestamp', 'desc')
          .limit(500)
          .get(),
        'stats_query'
      );
    } catch (queryError) {
      // DETEKSI ERROR INDEX
      if (queryError.message && queryError.message.includes('The query requires an index')) {
        logger.error({ group_id, err: queryError.message }, 'Missing Firestore Index');
        return sendError(res, "Configuration Error: Missing Firestore Index. Please check logs.", 500);
      }
      throw queryError;
    }

    if (logsSnapshot.empty) {
      return sendSuccess(res, {
        group_id, period: { from: fromDate.toISOString(), to: toDate.toISOString() },
        summary: { total_messages: 0, gcast_detected: 0, block_rate: 0 }, top_reasons: [], recent_logs: []
      });
    }

    let totalMessages = 0, gcastDetected = 0;
    const reasonCounts = {}, recentLogs = [];

    logsSnapshot.forEach(doc => {
      const log = doc.data();
      totalMessages++;
      if (log.is_gcast) {
        gcastDetected++;
        if (Array.isArray(log.reason)) log.reason.forEach(r => reasonCounts[r] = (reasonCounts[r] || 0) + 1);
      }
      if (recentLogs.length < 10) {
        recentLogs.push({
          timestamp: log.timestamp?.toDate?.() || log.timestamp,
          user_id: log.user_id, score: log.score, reason: log.reason
        });
      }
    });

    const blockRate = totalMessages > 0 ? ((gcastDetected / totalMessages) * 100).toFixed(2) : 0;
    const topReasons = Object.entries(reasonCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([reason, count]) => ({ reason, count }));

    return sendSuccess(res, {
      group_id, period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      summary: { total_messages: totalMessages, gcast_detected: gcastDetected, block_rate: parseFloat(blockRate) },
      top_reasons, recent_logs
    });

  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id });
    return sendError(res, "Failed to fetch statistics");
  }
});

// POST /v1/config/:group_id
router.post('/config/:group_id', verifyApiKey, validate(configSchema), async (req, res) => {
  try {
    const db = getDb();
    const groupId = req.params.group_id;
    const update = Object.fromEntries(Object.entries(req.validatedBody).filter(([_, v]) => v !== undefined));
  
    if (Object.keys(update).length === 0) return sendError(res, "No valid fields to update", 400);

    await withRetry(
      () => db.collection('configs').doc(groupId).set({ ...update, updated_at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true }),
      'config_update'
    );
  
    cache.del(`config:${groupId}`);
    return sendSuccess(res, { group_id: groupId, updated: update }, "Configuration updated");
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id });
    return sendError(res, "Failed to update config");
  }
});

// POST /v1/whitelist/:group_id/:user_id
router.post('/whitelist/:group_id/:user_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const { group_id, user_id } = req.params;
    await withRetry(() => db.collection('whitelist').doc(user_id).set({
      group_id, user_id, added_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 'whitelist_add');
    return sendSuccess(res, { group_id, user_id }, "User whitelisted");
  } catch (err) {
    return sendError(res, "Failed to whitelist user");
  }
});

// DELETE /v1/whitelist/:group_id/:user_id
router.delete('/whitelist/:group_id/:user_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    await withRetry(() => db.collection('whitelist').doc(req.params.user_id).delete(), 'whitelist_delete');
    return sendSuccess(res, { user_id: req.params.user_id }, "User removed from whitelist");
  } catch (err) {
    return sendError(res, "Failed to remove user");
  }
});

// POST /v1/blacklist/:group_id
router.post('/blacklist/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const { word } = req.body;
    const groupId = req.params.group_id;
    if (!word || typeof word !== 'string' || word.length < 2) return sendError(res, "Invalid word", 400);

    await withRetry(() => db.collection('blacklists').doc(groupId).set({
      group_id: groupId, words: admin.firestore.FieldValue.arrayUnion(word.toLowerCase()),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true }), 'blacklist_add');
  
    cache.del(`blacklist:${groupId}`);
    return sendSuccess(res, { word: word.toLowerCase() }, "Word added to blacklist");
  } catch (err) {
    return sendError(res, "Failed to add word");
  }
});

// DELETE /v1/blacklist/:group_id
router.delete('/blacklist/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const { word } = req.body;
    if (!word) return sendError(res, "Word is required", 400);
    
    await withRetry(() => db.collection('blacklists').doc(req.params.group_id).update({
      words: admin.firestore.FieldValue.arrayRemove(word.toLowerCase()),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }), 'blacklist_delete');
  
    cache.del(`blacklist:${req.params.group_id}`);
    return sendSuccess(res, { word: word.toLowerCase() }, "Word removed");
  } catch (err) {
    return sendError(res, "Failed to remove word");
  }
});

// GET /v1/blacklist/:group_id
router.get('/blacklist/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const doc = await withRetry(() => db.collection('blacklists').doc(req.params.group_id).get(), 'blacklist_get');
    const data = doc.exists ? doc.data() : { words: [] };
    return sendSuccess(res, { group_id: req.params.group_id, words: data.words || [], updated_at: data.updated_at });
  } catch (err) {
    return sendError(res, "Failed to fetch blacklist");
  }
});

// GET /v1/summary/:group_id
router.get('/summary/:group_id', verifyApiKey, async (req, res) => {
  try {
    const db = getDb();
    const groupId = req.params.group_id;
    const [configDoc, blacklistDoc] = await Promise.all([
      withRetry(() => db.collection('configs').doc(groupId).get(), 'summary_config'),
      withRetry(() => db.collection('blacklists').doc(groupId).get(), 'summary_blacklist')
    ]);
    const config = configDoc.exists ? configDoc.data() : {};
    const blacklist = blacklistDoc.exists ? (blacklistDoc.data().words || []) : [];
    
    return sendSuccess(res, {
      group_id: groupId, protection_enabled: !config.disabled,
      threshold: config.threshold || 0.65, expert_mode: config.expert_mode || false,
      blacklist_count: blacklist.length, last_updated: config.updated_at || null
    });
  } catch (err) {
    logger.errorWithStack(err, { group_id: req.params.group_id });
    return sendError(res, "Failed to get summary");
  }
});

module.exports = router;