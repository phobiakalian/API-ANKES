# 🛡️ Ankes API - Anti-Spam & Gcast Detection API

> High-performance REST API for detecting spam, broadcast messages (gcast), and malicious patterns in Telegram chats. Built for serverless deployment with automatic scaling, structured logging, and per-group configuration.

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?style=for-the-badge&logo=express&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-Serverless-000000?style=for-the-badge&logo=vercel&logoColor=white)
![Firestore](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)

---

## 📖 Table of Contents
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Quick Start](#-quick-start)
- [Environment Variables](#-environment-variables)
- [API Documentation](#-api-documentation)
- [Deployment Guide](#-deployment-guide)
- [Testing & Examples](#-testing--examples)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features
- 🔍 **Advanced Pattern Detection**: Analyzes ASCII density, link frequency, character repetition, and text duplication
- ⚙️ **Per-Group Configuration**: Adjustable thresholds, expert mode, enable/disable toggle
- 📊 **Real-time Statistics**: Query spam rates, top detection reasons, and recent logs
- 🚫 **Blacklist & ✅ Whitelist**: Custom word filters and user exemptions
- 💾 **Smart Caching**: In-memory LRU cache for configs & blacklists to reduce DB load
- 🔄 **Retry & Resilience**: Automatic retry on transient network errors with exponential backoff
- 📝 **Structured Logging**: Pino-based logging with request IDs, duration tracking, and error stack traces
- 🔒 **Security First**: Helmet, CORS, rate limiting, input sanitization (Zod), and API key authentication
- ☁️ **Serverless Ready**: Optimized for Vercel with cold-start mitigation and REST-based Firestore queries

---

## 🛠️ Tech Stack
| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20+ |
| Framework | Express.js |
| Database | Firebase Firestore |
| Validation | Zod |
| Logging | Pino + `pino-pretty` |
| Security | Helmet, CORS, `express-rate-limit` |
| Deployment | Vercel Serverless Functions |
| Cache | In-memory `Map` (LRU eviction) |

---

## 🚀 Quick Start

### 1️⃣ Prerequisites
- Node.js `v20+`
- npm or yarn
- Firebase Project with Firestore enabled
- Vercel Account (for production)

### 2️⃣ Installation
```bash
# Clone repository
git clone https://github.com/your-username/ankes-api.git
cd ankes-api

# Install dependencies
npm install
```

### 3️⃣ Environment Setup
```bash
cp .env.example .env
```
Fill in your credentials (see [Environment Variables](#-environment-variables)).

### 4️⃣ Run Locally
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```
Server will start at `http://localhost:3000`. Test with:
```bash
curl http://localhost:3000/health
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | ✅ | `development` or `production` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | ✅ | Firebase Admin SDK JSON key (stringified) |
| `FIREBASE_DATABASE_URL` | ✅ | Firestore database URL |
| `API_KEY` | ✅ | Secret key for `x-api-key` header authentication |
| `CACHE_TTL_MS` | ❌ | Cache time-to-live (default: `300000` / 5m) |
| `CACHE_MAX_SIZE` | ❌ | Max cache entries (default: `500`) |
| `ALLOWED_ORIGINS` | ❌ | Comma-separated CORS origins (production only) |
| `LOG_LEVEL` | ❌ | `debug`, `info`, `warn`, `error` (default: `info`) |
| `VERCEL` | ❌ | Set to `1` when deployed on Vercel |

---

## 📚 API Documentation

**Base URL**: `http://localhost:3000` (dev) or `https://<your-domain>.vercel.app` (prod)  
**Authentication**: All endpoints require header `x-api-key: <YOUR_API_KEY>`  
**Response Format**:
```json
{
  "success": true,
  "data": { ... },
  "error": null
}
```
*(On error: `success: false`, `data: null`, `error: "message"`)*

### 🔍 Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `POST` | `/v1/analyze` | Analyze text for spam/gcast |
| `GET` | `/v1/stats/:group_id` | Get group statistics |
| `GET` | `/v1/summary/:group_id` | Get group config summary |
| `POST` | `/v1/config/:group_id` | Update group configuration |
| `GET` | `/v1/blacklist/:group_id` | List blacklisted words |
| `POST` | `/v1/blacklist/:group_id` | Add word to blacklist |
| `DELETE` | `/v1/blacklist/:group_id` | Remove word from blacklist |
| `GET` | `/v1/whitelist/:group_id` | List whitelisted users |
| `POST` | `/v1/whitelist/:group_id/:user_id` | Add user to whitelist |
| `DELETE` | `/v1/whitelist/:group_id/:user_id` | Remove user from whitelist |

---

### 📦 Request & Response Examples

#### 1️⃣ `POST /v1/analyze`
**Body**:
```json
{
  "group_id": "-1001234567890",
  "user_id": "987654321",
  "text": "Promo spesial! Klik https://t.me/spam sekarang juga!!!"
}
```
**Response**:
```json
{
  "success": true,
  "data": {
    "is_gcast": true,
    "score": 0.892,
    "reason": ["contains_link", "high_special_chars"],
    "action": "delete"
  }
}
```

#### 2️⃣ `POST /v1/config/:group_id`
**Body**:
```json
{
  "threshold": 0.75,
  "expert_mode": true,
  "disabled": false
}
```

#### 3️⃣ `GET /v1/stats/:group_id?days=7`
**Query**: `days` (optional, max `30`, default `7`)
**Response**:
```json
{
  "success": true,
  "data": {
    "group_id": "-1001234567890",
    "period": { "from": "2026-04-28T00:00:00Z", "to": "2026-05-05T00:00:00Z" },
    "summary": { "total_messages": 450, "gcast_detected": 32, "block_rate": 7.11 },
    "top_reasons": [
      { "reason": "contains_link", "count": 18 },
      { "reason": "text_duplication", "count": 9 }
    ],
    "recent_logs": [ ... ]
  }
}
```

---

## ☁️ Deployment Guide

### 1️⃣ Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

### 2️⃣ Configure Environment Variables
Add all required vars in **Vercel Dashboard → Project Settings → Environment Variables**.

### 3️⃣ Firestore Indexes (If Needed)
The `/v1/stats` endpoint uses range queries. If you see `"The query requires an index"`, Vercel logs will provide a direct link to create the composite index in Firebase Console. Single-field indexes for other collections are auto-created.

### ⚠️ Vercel Execution Limits
- **Hobby**: 10s timeout
- **Pro/Enterprise**: 60s timeout
- The API includes a 55s internal timeout guard. Optimize queries for low-latency responses.

---

## 🧪 Testing & Examples

### ✅ Health Check
```bash
curl http://localhost:3000/health
```

### 🔍 Analyze Message
```bash
curl -X POST http://localhost:3000/v1/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key" \
  -d '{"group_id":"g1","user_id":"u1","text":"Halo teman-teman, apa kabar?"}'
```

### 📊 Get Stats
```bash
curl "http://localhost:3000/v1/stats/g1?days=14" \
  -H "x-api-key: your-secret-key"
```

### 🛠️ Run Automated Tests
```bash
npm test
```
*(Uses Jest + Supertest with mocked Firebase calls)*

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` | Ensure `x-api-key` matches `API_KEY` in `.env` |
| `500 Internal Server Error` | Check Vercel logs for stack traces |
| `Missing Firestore Index` | Click the link in error logs to auto-create in Firebase Console |
| `Timeout (Hobby Plan)` | Vercel Hobby limits to 10s. Upgrade or optimize DB queries |
| `Cache not persisting` | In-memory cache resets on cold start. Use Redis for distributed caching if needed |
| `CORS blocked` | Set `ALLOWED_ORIGINS` in production env vars |

---

## 🤝 Contributing
1. Fork the repository
2. Create your feature branch: `git checkout -b feat/awesome-feature`
3. Commit changes: `git commit -m 'Add awesome feature'`
4. Push to branch: `git push origin feat/awesome-feature`
5. Open a Pull Request

Please ensure code follows ESLint rules and includes tests for new endpoints.

---

## 📜 License
This project is licensed under the [MIT License](LICENSE).

---

> 💡 **Need a Telegram Bot integration?** Check out [Ankes Bot Repository](https://github.com/phobiakalian/ankes-bot) for a ready-to-deploy Python/Telethon bot that connects to this API.

🛠️ Built with ❤️ for safer validc0de communities.