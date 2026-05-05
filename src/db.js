// src/db.js
const admin = require('firebase-admin');
const logger = require('./logger');

let dbInstance = null;
let initializing = false;

async function getDb() {
  if (dbInstance) return dbInstance;
  
  // Cegah race condition saat init pertama
  if (initializing) {
    while (initializing) await new Promise(r => setTimeout(r, 50));
    return dbInstance;
  }
  
  initializing = true;
  
  try {
    if (!admin.apps.length) {
      let credential;
      
      // Prioritaskan Environment Variable JSON (Vercel friendly)
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        credential = admin.credential.cert(serviceAccount);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        credential = admin.credential.applicationDefault();
      } else {
        throw new Error('Missing Firebase credentials in Environment Variables');
      }
      
      admin.initializeApp({ 
        credential,
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
    
    dbInstance = admin.firestore();
    
    // Settingan optimasi untuk Vercel Serverless
    dbInstance.settings({ 
      ignoreUndefinedProperties: true,
      preferRest: true // Lebih stabil di serverless daripada gRPC
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

