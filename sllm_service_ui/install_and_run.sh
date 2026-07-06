#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8787}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11534}"
OLLAMA_BIN="${OLLAMA_BIN:-$APP_DIR/.local/ollama/bin/ollama}"
OLLAMA_MODELS_DIR="${OLLAMA_MODELS:-$APP_DIR/.local/ollama_models}"
OLLAMA_HOST_FOR_CLI="${OLLAMA_HOST:-${OLLAMA_URL#http://}}"
OLLAMA_HOST_FOR_CLI="${OLLAMA_HOST_FOR_CLI#https://}"
OLLAMA_HOST_FOR_CLI="${OLLAMA_HOST_FOR_CLI%/}"
PULL_MODELS="${PULL_MODELS:-1}"
PULL_QWEN_14="${PULL_QWEN_14:-0}"
START_BACKGROUND="${START_BACKGROUND:-1}"
SKIP_OLLAMA="${SKIP_OLLAMA:-0}"

LOCAL_MODELS=("${OLLAMA_MODEL:-gemma4:e4b}")
if [ "$PULL_QWEN_14" = "1" ]; then
  LOCAL_MODELS+=("${QWEN_14_MODEL:-qwen3:14b}")
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

run_as_root() {
  if [ -n "$SUDO" ]; then
    "$SUDO" "$@"
  else
    "$@"
  fi
}

have_command() {
  command -v "$1" >/dev/null 2>&1
}

install_node() {
  if have_command node; then
    return
  fi

  echo "[install] Node.js not found. Installing Node.js..."
  if have_command apt-get; then
    run_as_root apt-get update
    run_as_root apt-get install -y ca-certificates curl gnupg
    if [ -n "$SUDO" ]; then
      curl -fsSL https://deb.nodesource.com/setup_20.x | "$SUDO" -E bash -
    else
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    fi
    run_as_root apt-get install -y nodejs
  elif have_command dnf; then
    run_as_root dnf install -y nodejs npm
  elif have_command yum; then
    run_as_root yum install -y nodejs npm
  elif have_command brew; then
    brew install node
  else
    echo "[error] Could not install Node.js automatically. Install Node.js 18+ and rerun."
    exit 1
  fi
}

check_node_version() {
  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [ "$major" -lt 18 ]; then
    echo "[error] Node.js 18+ is required. Current version: $(node --version)"
    exit 1
  fi
}

install_ollama() {
  if [ "$SKIP_OLLAMA" = "1" ]; then
    echo "[skip] SKIP_OLLAMA=1, skipping local model backend install/start."
    return
  fi

  if [ -x "$OLLAMA_BIN" ]; then
    return
  fi

  if have_command ollama; then
    OLLAMA_BIN="$(command -v ollama)"
    return
  fi

  echo "[install] Ollama not found. Installing Ollama..."
  if ! have_command curl; then
    if have_command apt-get; then
      run_as_root apt-get update
      run_as_root apt-get install -y curl
    elif have_command dnf; then
      run_as_root dnf install -y curl
    elif have_command yum; then
      run_as_root yum install -y curl
    else
      echo "[error] curl is required to install Ollama."
      exit 1
    fi
  fi
  curl -fsSL https://ollama.com/install.sh | sh
  OLLAMA_BIN="$(command -v ollama)"
}

start_ollama() {
  if [ "$SKIP_OLLAMA" = "1" ]; then
    return
  fi

  if curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
    echo "[ok] Local model backend is already reachable at $OLLAMA_URL"
    return
  fi

  if [ ! -x "$OLLAMA_BIN" ]; then
    echo "[error] Ollama binary is not executable: $OLLAMA_BIN"
    exit 1
  fi

  echo "[start] Starting local model backend with $OLLAMA_BIN..."
  OLLAMA_HOST="$OLLAMA_HOST_FOR_CLI" OLLAMA_MODELS="$OLLAMA_MODELS_DIR" nohup "$OLLAMA_BIN" serve > ollama.log 2>&1 &
  sleep 5

  if ! curl -fsS "$OLLAMA_URL/api/tags" >/dev/null 2>&1; then
    echo "[error] Local model backend did not become reachable at $OLLAMA_URL"
    echo "        Check ollama.log or set SKIP_OLLAMA=1 if you use a remote backend."
    exit 1
  fi
}

pull_models() {
  if [ "$SKIP_OLLAMA" = "1" ] || [ "$PULL_MODELS" != "1" ]; then
    return
  fi

  for model in "${LOCAL_MODELS[@]}"; do
    echo "[pull] $model"
    OLLAMA_HOST="$OLLAMA_HOST_FOR_CLI" OLLAMA_MODELS="$OLLAMA_MODELS_DIR" "$OLLAMA_BIN" pull "$model"
  done
}

prepare_env() {
  if [ ! -f .env ]; then
    cp .env.example .env
    echo "[init] Created .env from .env.example"
  fi
}

check_app() {
  node --check server.js
  node --check public/app.js
}

stop_pid() {
  local pid="$1"
  if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" || true
    for _ in 1 2 3 4 5; do
      if ! kill -0 "$pid" >/dev/null 2>&1; then
        return
      fi
      sleep 1
    done
  fi
}

stop_port_listener() {
  local port="$1"
  local pids
  if ! have_command ss; then
    return
  fi

  pids="$(
    ss -ltnp 2>/dev/null \
      | awk -v port=":${port}" '$4 ~ port "$" && $0 ~ /pid=/ {print $0}' \
      | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' \
      | sort -u
  )"

  for pid in $pids; do
    echo "[restart] Stopping process $pid on port $port"
    stop_pid "$pid"
  done
}

stop_existing_app() {
  if [ -f local-llm-chat.pid ]; then
    local pid
    pid="$(cat local-llm-chat.pid)"
    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "[restart] Stopping existing app process $pid"
      stop_pid "$pid"
    fi
  fi

  stop_port_listener "$PORT"
  rm -f local-llm-chat.pid local-llm-chat.port
}

start_app() {
  export HOST PORT OLLAMA_URL

  if [ "$START_BACKGROUND" = "1" ]; then
    stop_existing_app

    if have_command setsid; then
      setsid env STRICT_PORT=1 node server.js > local-llm-chat.log 2>&1 < /dev/null &
    else
      nohup env STRICT_PORT=1 node server.js > local-llm-chat.log 2>&1 &
    fi
    echo "$!" > local-llm-chat.pid
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if [ -f local-llm-chat.port ] && curl -fsS "http://127.0.0.1:$(cat local-llm-chat.port)/api/health" >/dev/null 2>&1; then
        break
      fi
      if ! kill -0 "$(cat local-llm-chat.pid)" >/dev/null 2>&1; then
        echo "[error] Local LLM Chat exited early. See $APP_DIR/local-llm-chat.log"
        exit 1
      fi
      sleep 1
    done
    if [ ! -f local-llm-chat.port ] || ! curl -fsS "http://127.0.0.1:$(cat local-llm-chat.port)/api/health" >/dev/null 2>&1; then
      echo "[error] Local LLM Chat did not start. See $APP_DIR/local-llm-chat.log"
      exit 1
    fi
    local actual_port
    actual_port="$(cat local-llm-chat.port)"
    echo "[ok] Local LLM Chat is running in background."
    echo "     PID: $(cat local-llm-chat.pid)"
    echo "     URL: http://127.0.0.1:${actual_port}"
    echo "     LAN: http://$(hostname -I 2>/dev/null | awk '{print $1}'):${actual_port}"
     echo "     Log: $APP_DIR/local-llm-chat.log"
  else
    echo "[start] Running in foreground at http://0.0.0.0:${PORT}"
    exec env STRICT_PORT=1 node server.js
  fi
}

install_node
check_node_version
prepare_env
install_ollama
start_ollama
pull_models
check_app
start_app
