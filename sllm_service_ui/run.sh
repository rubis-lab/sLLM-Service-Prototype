#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
fi

set -a
# shellcheck disable=SC1091
. ./.env
set +a

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"
export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11534}"

node --check server.js
node --check public/app.js
exec node server.js
