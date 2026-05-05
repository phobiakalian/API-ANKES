const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const logger = require('./logger');
const { sendError } = require('./utils/response');

// Input Sanitization
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Hapus control chars
    .substring(0, 4000);
};

// Verify API Key
const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return sendError(res, "Missing API Key. Provide 'x-api-key' in header.", 401);
  }
  
  if (apiKey !== process.env.API_KEY) {
    logger.warn({ ip: req.ip, path: req.path }, 'Invalid API Key attempt');
    return sendError(res, "Invalid API Key.", 401);
  }
  
  next();
};

// Schemas
const analyzeSchema = z.object({
  group_id: z.string().min(1).max(100),
  user_id: z.string().min(1).max(100),
  text: z.string().min(1).max(4000)
});

const configSchema = z.object({
  threshold: z.number().min(0.1).max(1.0).optional(),
  expert_mode: z.boolean().optional(),
  auto_delete: z.boolean().optional(),
  disabled: z.boolean().optional(),
  logging_level: z.enum(['none', 'gcast_only', 'links_only', 'all']).optional()
});

// Validation Middleware
const validate = (schema) => (req, res, next) => {
  if (req.body?.text) req.body.text = sanitizeInput(req.body.text);
  if (req.body?.group_id) req.body.group_id = sanitizeInput(req.body.group_id);
  if (req.body?.user_id) req.body.user_id = sanitizeInput(req.body.user_id);
  
  const result = schema.safeParse(req.body);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    return sendError(res, "Invalid input data", 400, errors);
  }
  
  req.validatedBody = result.data;
  next();
};

// Tambahkan Request ID unik untuk setiap request
const addRequestId = (req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
};

module.exports = { verifyApiKey, validate, analyzeSchema, configSchema, sanitizeInput, addRequestId };