#!/bin/bash
# test-quick.sh

BASE_URL="https://api-ankes.vercel.app"
API_KEY="a3f8b2c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678"

echo "🔍 Testing Health..."
curl -s "$BASE_URL/health" | python3 -m json.tool

echo -e "\n🔍 Testing Analyze (clean text)..."
curl -s -X POST "$BASE_URL/v1/analyze" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"group_id":"g1","user_id":"u1","text":"Halo apa kabar?"}' | python3 -m json.tool

echo -e "\n🔍 Testing Analyze (spam with link)..."
curl -s -X POST "$BASE_URL/v1/analyze" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"group_id":"g1","user_id":"u1","text":"Promo! Klik https://t.me/spam sekarang!!!"}' | python3 -m json.tool

echo -e "\n✅ Testing complete!"