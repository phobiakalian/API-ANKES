# 🛡️ Ankes Antigcast API

> Anti-spam API untuk mendeteksi dan memblokir pesan broadcast/gcast di grup Telegram.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D16-green)](https://nodejs.org/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black)](https://vercel.com)
[![Firebase](https://img.shields.io/badge/Database-Firebase-orange)](https://firebase.google.com)

</div>

## ✨ Fitur

- 🔗 **Link Detection**: Pesan dengan URL (`https://`, `t.me/`, `www.`) otomatis terdeteksi
- 🚫 **Custom Blacklist**: Admin bisa menambah kata terlarang via API
- 🛡️ **Whitelist Support**: User tertentu bisa di-exempt dari filter
- 📊 **Smart Logging**: Hanya pesan penting yang disimpan (hemat quota Firestore)
- 🔐 **API Key Auth**: Semua endpoint dilindungi dengan API key
- ⚡ **Caching**: Config & blacklist di-cache untuk performa optimal
- 🔄 **Retry Logic**: Auto-retry untuk transient errors
- 📈 **Health Check**: Endpoint monitoring untuk uptime tracking

## 🚀 Quick Start

### Prerequisites
- Node.js >= 16
- Firebase project dengan Firestore aktif
- Telegram Bot Token (dari @BotFather)

### Local Development
```bash
# 1. Clone repo
git clone https://github.com/phobiakalian/API-ANKES.git
cd ankes-api

# 2. Install dependencies
npm install

# 3. Setup environment
cp .env.example .env
# Edit .env dengan konfigurasi Anda

# 4. Run locally
npm run dev