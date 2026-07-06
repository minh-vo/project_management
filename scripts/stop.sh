#!/usr/bin/env bash
# Stop and remove the app container (Mac/Linux).
set -euo pipefail

docker rm -f pm-app >/dev/null 2>&1 || true
echo "App stopped"
