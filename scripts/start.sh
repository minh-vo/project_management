#!/usr/bin/env bash
# Build and run the app container (Mac/Linux).
set -euo pipefail
cd "$(dirname "$0")/.."

docker build -t pm-app .
docker rm -f pm-app >/dev/null 2>&1 || true
docker run -d --name pm-app --env-file .env -p 8000:8000 -v pm-data:/data pm-app

echo "App running at http://localhost:8000"
