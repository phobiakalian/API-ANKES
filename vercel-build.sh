#!/bin/bash
# vercel-build.sh
if [ ! -z "$FIREBASE_SERVICE_ACCOUNT_JSON" ]; then
  echo "$FIREBASE_SERVICE_ACCOUNT_JSON" | node -e "
    const fs = require('fs');
    const json = JSON.parse(require('fs').readFileSync(0, 'utf-8'));
    fs.writeFileSync('firebase-service-account.json', JSON.stringify(json));
  "
  export FIREBASE_SERVICE_ACCOUNT_PATH="./firebase-service-account.json"
fi
npm run build  # atau echo "Build complete"