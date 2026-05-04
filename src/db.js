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
    if (!admin.apps.length) {
      let credential;
      
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        credential = admin.credential.cert(serviceAccount);
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        const serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
        credential = admin.credential.cert(serviceAccount);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        credential = admin.credential.applicationDefault();
      } else {
        throw new Error('Missing Firebase credentials');
      }
      
      admin.initializeApp({ 
        credential,
        databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
      });
    }
    
    dbInstance = admin.firestore();
    dbInstance.settings({ 
      ignoreUndefinedProperties: true,
      preferRest: process.env.VERCEL === '1'
    });
    
    return dbInstance;
    
  } catch (error) {
    logger.error('Firebase init failed:', error.message);
    throw error;
  } finally {
    initializing = false;
  }
}

module.exports = { getDb, admin };