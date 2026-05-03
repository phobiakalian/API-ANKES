// src/db.js
const admin = require('firebase-admin');
const fs = require('fs');
const logger = require('./logger');

let dbInstance = null;
let initializing = false;

/**
 * Get Firestore database instance with lazy initialization
 * Safe for serverless environments (Vercel)
 */
async function getDb() {
  if (dbInstance) return dbInstance;
  
  // Prevent race condition in serverless cold starts
  if (initializing) {
    // Wait for initialization to complete
    while (initializing) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return dbInstance;
  }
  
  initializing = true;
  
  try {
    if (!admin.apps.length) {
      let credential;
      
      // Prioritaskan JSON string dari env (untuk Vercel), fallback ke file path (local dev)
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          credential = admin.credential.cert(serviceAccount);
          logger.info('✅ Firebase initialized from JSON env var');
        } catch (e) {
          logger.error('❌ Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
          throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e.message}`);
        }
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        try {
          const serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
          credential = admin.credential.cert(serviceAccount);
          logger.info(`✅ Firebase initialized from file: ${process.env.FIREBASE_SERVICE_ACCOUNT_PATH}`);
        } catch (e) {
          logger.error('❌ Error reading Firebase service account file:', e.message);
          throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_PATH: ${e.message}`);
        }
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Fallback untuk Google Cloud Run / GCP
        credential = admin.credential.applicationDefault();
        logger.info('✅ Firebase initialized with application default credentials');
      } else {
        const errorMsg = 'Missing Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH in .env';
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      admin.initializeApp({ 
        credential,
        // Optimasi untuk serverless: disable unnecessary features
        databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
      });
    }
    
    dbInstance = admin.firestore();
    
    // Settings untuk optimasi
    dbInstance.settings({ 
      ignoreUndefinedProperties: true,
      // Untuk Vercel: gunakan preferRest: true untuk koneksi lebih ringan
      preferRest: process.env.VERCEL === '1'
    });
    
    logger.info('✅ Firestore instance ready');
    return dbInstance;
    
  } catch (error) {
    logger.errorWithStack(error, 'Firebase initialization failed');
    throw error;
  } finally {
    initializing = false;
  }
}

/**
 * Graceful shutdown handler for Firestore
 */
async function shutdown() {
  if (admin.apps.length) {
    await admin.app().delete();
    logger.info('✅ Firebase app deleted');
  }
  dbInstance = null;
}

module.exports = { getDb, admin, shutdown };