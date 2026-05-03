#!/usr/bin/env node
// scripts/cleanup-logs.js
// Auto-cleanup script untuk menghapus log Firestore yang sudah tua
// Usage: node scripts/cleanup-logs.js [days]

require('dotenv').config();
const { getDb, admin } = require('../src/db');
const logger = require('../src/logger');

// Configuration
const DEFAULT_DAYS_TO_KEEP = parseInt(process.env.LOGS_RETENTION_DAYS) || 30;
const BATCH_SIZE = 500; // Max documents per batch delete

/**
 * Delete logs older than specified days
 * @param {number} daysToKeep - Number of days to retain logs
 */
async function cleanupOldLogs(daysToKeep = DEFAULT_DAYS_TO_KEEP) {
  const startTime = Date.now();
  
  try {
    const db = await getDb();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);
    
    logger.info(`🗑️ Starting cleanup: deleting logs older than ${cutoff.toISOString()} (${daysToKeep} days)`);
    
    let totalDeleted = 0;
    let batchCount = 0;
    
    while (true) {
      // Fetch documents to delete (limited by BATCH_SIZE)
      const snapshot = await db.collection('logs')
        .where('timestamp', '<', admin.firestore.Timestamp.fromDate(cutoff))
        .limit(BATCH_SIZE)
        .get();
      
      if (snapshot.empty) {
        logger.info('✅ No more old logs found');
        break;
      }
      
      // Create batch delete operation
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Execute batch
      await batch.commit();
      
      batchCount++;
      totalDeleted += snapshot.size;
      
      logger.info(`🗑️ Batch ${batchCount}: Deleted ${snapshot.size} logs (total: ${totalDeleted})`);
      
      // Small delay to avoid rate limiting
      if (snapshot.size === BATCH_SIZE) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`✨ Cleanup complete! Deleted ${totalDeleted} logs in ${duration}s`);
    
    return { success: true, deleted: totalDeleted, duration };
    
  } catch (error) {
    logger.errorWithStack(error, 'Cleanup failed');
    throw error;
  }
}

/**
 * Get stats about logs collection (for monitoring)
 */
async function getLogsStats() {
  try {
    const db = await getDb();
    
    // Note: Firestore doesn't support count() in all SDKs yet
    // This is a simple estimate using limit(1) to check if collection exists
    const snapshot = await db.collection('logs').limit(1).get();
    
    return {
      hasLogs: !snapshot.empty,
      message: snapshot.empty ? 'No logs found' : 'Logs collection exists'
    };
  } catch (error) {
    logger.error('Failed to get logs stats:', error.message);
    return { error: error.message };
  }
}

// CLI handling
if (require.main === module) {
  const daysArg = process.argv[2];
  const daysToKeep = daysArg ? parseInt(daysArg) : DEFAULT_DAYS_TO_KEEP;
  
  if (isNaN(daysToKeep) || daysToKeep < 1) {
    console.error('Usage: node scripts/cleanup-logs.js [days]');
    console.error('  days: Number of days to retain logs (default: 30)');
    process.exit(1);
  }
  
  logger.info(`🚀 Starting cleanup script with ${daysToKeep} days retention`);
  
  cleanupOldLogs(daysToKeep)
    .then(result => {
      logger.info('✅ Script completed successfully', result);
      process.exit(0);
    })
    .catch(error => {
      logger.error('❌ Script failed', error);
      process.exit(1);
    });
}

module.exports = { cleanupOldLogs, getLogsStats };