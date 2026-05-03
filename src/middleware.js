// src/middleware.js
const { z } = require('zod');
const logger = require('./logger');

// Sanitize input untuk cegah injection & DoS
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
    .substring(0, 4000); // Max length untuk cegah DoS
};

const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    logger.warn({ path: req.path, ip: req.ip }, 'Missing API key');
    return res.status(401).json({ error: "Missing API Key" });
  }
  
  if (apiKey !== process.env.API_KEY) {
    logger.warn({ path: req.path, ip: req.ip }, 'Invalid API key attempt');
    return res.status(401).json({ error: "Invalid API Key" });
  }
  
  next();
};

const analyzeSchema = z.object({
  group_id: z.string().min(1, "group_id required").max(100),
  user_id: z.string().min(1, "user_id required").max(100),
  text: z.string().min(1, "text required").max(4000)
});

const configSchema = z.object({
  threshold: z.number().min(0.1).max(1.0).optional(),
  expert_mode: z.boolean().optional(),
  auto_delete: z.boolean().optional(),
  disabled: z.boolean().optional(),
  logging_level: z.enum(['none', 'gcast_only', 'links_only', 'all']).optional()
});

const validate = (schema) => (req, res, next) => {
  // Sanitize input sebelum validate
  if (req.body?.text) req.body.text = sanitizeInput(req.body.text);
  if (req.body?.group_id) req.body.group_id = sanitizeInput(req.body.group_id);
  if (req.body?.user_id) req.body.user_id = sanitizeInput(req.body.user_id);
  
  const result = schema.safeParse(req.body);
  
  if (!result.success) {
    logger.warn({ 
      path: req.path, 
      errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    }, 'Validation failed');
    
    return res.status(400).json({ 
      error: "Invalid payload", 
      details: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
    });
  }
  
  req.validatedBody = result.data;
  next();
};

module.exports = { verifyApiKey, validate, analyzeSchema, configSchema, sanitizeInput };