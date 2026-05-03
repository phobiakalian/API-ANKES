#!/usr/bin/env node
// scripts/health-check.js
// Health check script untuk monitoring eksternal
// Usage: node scripts/health-check.js
// Exit code: 0 = healthy, 1 = unhealthy

require('dotenv').config();
const httpx = require('httpx'); // atau gunakan node-fetch jika lebih prefer

// Configuration
const API_URL = process.env.API_URL || process.env.VERCEL_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY;
const TIMEOUT_MS = parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000;
const EXPECTED_LATENCY_MS = parseInt(process.env.HEALTH_CHECK_MAX_LATENCY) || 2000;

/**
 * Perform health check against the API
 * @returns {Object} Health check result
 */
async function healthCheck() {
  const startTime = Date.now();
  
  try {
    // Test health endpoint
    const response = await httpx.get(`${API_URL}/health`, {
      headers: { 
        'x-api-key': API_KEY,
        'User-Agent': 'ankes-health-check/1.0'
      },
      timeout: TIMEOUT_MS
    });
    
    const latency = Date.now() - startTime;
    const data = JSON.parse(response.data);
    
    // Validate response
    const checks = {
      status_ok: data.status === 'ok',
      firestore_connected: data.firestore === 'connected',
      latency_acceptable: latency < EXPECTED_LATENCY_MS,
      has_version: !!data.version,
      has_timestamp: !!data.timestamp
    };
    
    const allPassed = Object.values(checks).every(v => v);
    
    const result = {
      healthy: allPassed,
      latency_ms: latency,
      timestamp: new Date().toISOString(),
      api_url: API_URL,
      response: data,
      checks
    };
    
    if (allPassed) {
      console.log('✅ Healthy');
      console.log(`   Latency: ${latency}ms`);
      console.log(`   Version: ${data.version}`);
      console.log(`   Uptime: ${data.uptime?.toFixed(1)}s`);
    } else {
      console.error('❌ Unhealthy');
      console.error(`   Failed checks: ${Object.entries(checks).filter(([_, v]) => !v).map(([k]) => k).join(', ')}`);
      console.error(`   Response: ${JSON.stringify(data, null, 2)}`);
    }
    
    return result;
    
  } catch (error) {
    const latency = Date.now() - startTime;
    
    console.error('❌ Unreachable');
    console.error(`   Error: ${error.message}`);
    console.error(`   Latency: ${latency}ms (timeout: ${TIMEOUT_MS}ms)`);
    console.error(`   URL: ${API_URL}/health`);
    
    return {
      healthy: false,
      error: error.message,
      latency_ms: latency,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Run health check and exit with appropriate code
 */
async function run() {
  try {
    const result = await healthCheck();
    
    // Exit with code based on health status
    process.exit(result.healthy ? 0 : 1);
    
  } catch (error) {
    console.error('Health check script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  run();
}

module.exports = { healthCheck, run };