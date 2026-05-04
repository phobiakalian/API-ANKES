// src/db.js
const admin = require('firebase-admin');
const fs = require('fs');
const logger = require('./logger');

let dbInstance = null;
let initializing = false;

async function getDb() {
  if (dbInstance) return dbInstance;
  if (initializing) {
    while (initializing) await new Promise(r => setTimeout(r, 50));
    return dbInstance;
  }
  
  initializing = true;
  
  try {
    logger.info('🔍 Firebase init started', {
      hasJsonEnv: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      hasPathEnv: !!process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
      jsonLength: process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.length || 0,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      appsCount: admin.apps.length
    });
    
    if (!admin.apps.length) {
      let credential;
      
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          logger.info('🔑 Parsing FIREBASE_SERVICE_ACCOUNT_JSON...');
          const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          
          logger.info('✅ Parsed service account', {
            project_id: serviceAccount.project_id,
            client_email: serviceAccount.client_email,
            private_key_preview: serviceAccount.private_key?.substring(0, 27) + '...'
          });
          
          credential = admin.credential.cert(serviceAccount);
          logger.info('✅ Credential object created');
          
        } catch (parseError) {
          logger.error('❌ JSON parse failed', {
            error: parseError.message,
            jsonPreview: process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.substring(0, 100) + '...'
          });
          throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${parseError.message}`);
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
        credential = admin.credential.applicationDefault();
        logger.info('✅ Firebase initialized with application default credentials');
      } else {
        const errorMsg = 'Missing Firebase credentials';
        logger.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      logger.info('🚀 Calling admin.initializeApp...');
      admin.initializeApp({ 
        credential,
        databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
      });
      logger.info('✅ admin.initializeApp completed');
    }
    
    dbInstance = admin.firestore();
    dbInstance.settings({ 
      ignoreUndefinedProperties: true,
      preferRest: process.env.VERCEL === '1'
    });
    
    logger.info('🔍 Testing Firestore connection...');
    await dbInstance.collection('_health_check').doc('ping').get();
    logger.info('✅ Firestore connection verified');
    
    return dbInstance;
    
  } catch (error) {
    logger.error('❌ Firebase init FAILED', {
      message: error.message,
      code: error.code,
      status: error.status,
      stack: error.stack?.split('\n')[0]
    });
    throw error;
  } finally {
    initializing = false;
  }
}

async function shutdown() {
  if (admin.apps.length) {
    await admin.app().delete();
    logger.info('✅ Firebase app deleted');
  }
  dbInstance = null;
}

module.exports = { getDb, admin, shutdown };