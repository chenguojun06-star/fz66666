#!/usr/bin/env bash

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"

mkdir -p "$RUN_DIR"

ENV_FILE="$RUN_DIR/backend.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-8090}"

FRONTEND_LOG="$RUN_DIR/frontend.log"
BACKEND_LOG="$RUN_DIR/backend.log"
TUNNEL_LOG="$RUN_DIR/tunnel.log"

FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
TUNNEL_PID_FILE="$RUN_DIR/tunnel.pid"

PUBLIC_URL_FILE="$RUN_DIR/public-url.txt"

is_pid_running() {
  local pid="${1:-}"
  if [[ -z "$pid" ]]; then
    return 1
  fi
  kill -0 "$pid" >/dev/null 2>&1
}

read_pid_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    tr -d ' \t\n\r' < "$file" || true
  else
    echo ""
  fi
}

extract_public_url() {
  if [[ -f "$TUNNEL_LOG" ]]; then
    grep -Eio 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -n 1 || true
  else
    echo ""
  fi
}

find_tunnel_pid() {
  pgrep -f "cloudflared tunnel --url http://localhost:$FRONTEND_PORT" 2>/dev/null | head -n 1 || true
}

start_backend() {
  local existing_pid
  existing_pid="$(read_pid_file "$BACKEND_PID_FILE")"
  if is_pid_running "$existing_pid"; then
    return 0
  fi

  if lsof -ti ":$BACKEND_PORT" >/dev/null 2>&1; then
    return 0
  fi

  (cd "$ROOT_DIR/backend" && exec mvn spring-boot:run -Dspring-boot.run.arguments=--server.port="$BACKEND_PORT" >>"$BACKEND_LOG" 2>&1) &
  echo "$!" > "$BACKEND_PID_FILE"
}

start_frontend() {
  local existing_pid
  existing_pid="$(read_pid_file "$FRONTEND_PID_FILE")"
  if is_pid_running "$existing_pid"; then
    return 0
  fi

  if lsof -ti ":$FRONTEND_PORT" >/dev/null 2>&1; then
    return 0
  fi

  (cd "$ROOT_DIR/frontend" && exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT" >>"$FRONTEND_LOG" 2>&1) &
  echo "$!" > "$FRONTEND_PID_FILE"
}

start_tunnel() {
  local existing_pid
  existing_pid="$(read_pid_file "$TUNNEL_PID_FILE")"
  if is_pid_running "$existing_pid"; then
    return 0
  fi

  local found_pid
  found_pid="$(find_tunnel_pid)"
  if is_pid_running "$found_pid"; then
    echo "$found_pid" > "$TUNNEL_PID_FILE"
    return 0
  fi

  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared 未安装或不在 PATH：请先安装 cloudflared" >&2
    exit 1
  fi

  (cd "$ROOT_DIR" && exec cloudflared tunnel --url "http://localhost:$FRONTEND_PORT" --no-autoupdate >>"$TUNNEL_LOG" 2>&1) &
  echo "$!" > "$TUNNEL_PID_FILE"
}

wait_public_url() {
  local timeout_s="${1:-25}"
  local start
  start="$(date +%s)"

  while true; do
    local url
    url="$(extract_public_url)"
    if [[ -n "$url" ]]; then
      echo "$url" > "$PUBLIC_URL_FILE"
      echo "$url"
      return 0
    fi

    local now
    now="$(date +%s)"
    if (( now - start >= timeout_s )); then
      echo "" > "$PUBLIC_URL_FILE"
      echo "" 
      return 1
    fi
    sleep 0.4
  done
}

CMD="${1:-up}"

if [[ "$CMD" == "url" ]]; then
  if [[ -f "$PUBLIC_URL_FILE" ]]; then
    cat "$PUBLIC_URL_FILE" || true
    exit 0
  fi
  extract_public_url
  exit 0
fi

if [[ "$CMD" == "down" ]]; then
  for f in "$TUNNEL_PID_FILE" "$FRONTEND_PID_FILE" "$BACKEND_PID_FILE"; do
    pid="$(read_pid_file "$f")"
    if is_pid_running "$pid"; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
    rm -f "$f"
  done

  tunnel_pid="$(find_tunnel_pid)"
  if is_pid_running "$tunnel_pid"; then
    kill "$tunnel_pid" >/dev/null 2>&1 || true
  fi

  rm -f "$PUBLIC_URL_FILE"
  exit 0
fi

start_backend
start_frontend
start_tunnel

echo "本地前端：http://localhost:$FRONTEND_PORT"
echo "本地后端：http://localhost:$BACKEND_PORT"

url=""
if url="$(wait_public_url 25)"; then
  echo "外网地址：$url"
else
  echo "外网地址：未获取到（可稍后执行：bash scripts/dev-up.sh url）" >&2
fi
