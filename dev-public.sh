#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUN_DIR="$ROOT_DIR/.run"

ENV_FILE="$RUN_DIR/backend.env"

# ⭐ 如果环境变量文件不存在，自动创建
if [[ ! -f "$ENV_FILE" ]]; then
  echo "📝 创建环境变量文件: $ENV_FILE"
  mkdir -p "$RUN_DIR"
  cat > "$ENV_FILE" << 'EOF'
# 开发环境配置 (自动生成)
APP_AUTH_JWT_SECRET=ThisIsA_LocalJwtSecret_OnlyForDev_0123456789
SPRING_DATASOURCE_URL=jdbc:mysql://localhost:3308/fashion_supplychain
SPRING_DATASOURCE_USERNAME=root
SPRING_DATASOURCE_PASSWORD=changeme
WECHAT_MINI_PROGRAM_MOCK_ENABLED=true
EOF
  echo "✅ 环境变量文件已创建"
else
  echo "📋 使用现有环境变量: $ENV_FILE"
fi

# 加载环境变量
if [[ -f "$ENV_FILE" ]]; then
  set -a
  . "$ENV_FILE"
  set +a
  echo "✅ 环境变量已加载"
fi

mkdir -p "$RUN_DIR"

BACKEND_LOG="$RUN_DIR/backend.out.log"
FRONTEND_LOG="$RUN_DIR/frontend.out.log"
TUNNEL_LOG="$RUN_DIR/tunnel.log"
PUBLIC_URL_FILE="$RUN_DIR/public-url.txt"

BACKEND_PID=""
FRONTEND_PID=""
TUNNEL_WEB_PID=""
TUNNEL_API_PID=""
MYSQL_READY=0

is_listening() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

wait_http() {
  local url="$1"
  local seconds="$2"
  local start
  start="$(date +%s)"
  while true; do
    if curl -sS -o /dev/null --max-time 2 "${url}" >/dev/null 2>&1; then
      return 0
    fi
    local now
    now="$(date +%s)"
    if (( now - start >= seconds )); then
      return 1
    fi
    sleep 0.5
  done
}

wait_port() {
  local port="$1"
  local seconds="$2"
  local start
  start="$(date +%s)"
  while true; do
    if is_listening "${port}"; then
      return 0
    fi
    local now
    now="$(date +%s)"
    if (( now - start >= seconds )); then
      return 1
    fi
    sleep 0.5
  done
}

cleanup() {
  set +e
  if [[ -n "${TUNNEL_API_PID}" ]]; then kill "${TUNNEL_API_PID}" >/dev/null 2>&1; fi
  if [[ -n "${TUNNEL_WEB_PID}" ]]; then kill "${TUNNEL_WEB_PID}" >/dev/null 2>&1; fi
  if [[ -n "${FRONTEND_PID}" ]]; then kill "${FRONTEND_PID}" >/dev/null 2>&1; fi
  if [[ -n "${BACKEND_PID}" ]]; then kill "${BACKEND_PID}" >/dev/null 2>&1; fi
}

trap cleanup EXIT INT TERM

MYSQL_PORT="${MYSQL_PORT:-}"
if [[ -z "$MYSQL_PORT" ]]; then
  if [[ "${SPRING_DATASOURCE_URL:-}" =~ jdbc:mysql://[^:/]+:([0-9]+)/ ]]; then
    MYSQL_PORT="${BASH_REMATCH[1]}"
  else
    MYSQL_PORT="3306"
  fi
fi

echo "[0/3] 检查 MySQL (${MYSQL_PORT}) ..."
if is_listening "${MYSQL_PORT}"; then
  MYSQL_READY=1
  echo "- MySQL 已在运行"
else
  if command -v brew >/dev/null 2>&1; then
    (brew services start mysql >/dev/null 2>&1 || brew services start mariadb >/dev/null 2>&1 || true)
  fi
  if command -v mysql.server >/dev/null 2>&1; then
    (mysql.server start >/dev/null 2>&1 || true)
  fi
  if wait_port "${MYSQL_PORT}" 30; then
    MYSQL_READY=1
    echo "- MySQL 已启动"
  else
    echo "- MySQL 未就绪：后端将启动失败（登录/接口会 502）"
  fi
fi

echo "[1/3] 启动后端 (Spring Boot) ..."
# 固定 Java 17（Lombok 不兼容 Java 25）
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export PATH="$JAVA_HOME/bin:$PATH"
if is_listening 8088; then
  echo "- 后端 8088 已在运行，跳过启动"
  BACKEND_PID=""
else
  if [[ "$MYSQL_READY" -eq 1 ]]; then
    (cd "$ROOT_DIR/backend" && mvn -DskipTests spring-boot:run) >"$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!
  else
    echo "- 跳过后端启动（MySQL 未就绪）"
  fi
fi

echo "[2/3] 启动前端 (Vite) ..."
if is_listening 5173; then
  echo "- 前端 5173 已在运行，跳过启动"
else
  # ⚠️ 【禁止修改】--host 0.0.0.0 为内网访问固定配置
  # 配合 vite.config.ts 中 hmr.host='192.168.1.19' 使用
  # 访问地址: http://192.168.1.19:5173/
  (cd "$ROOT_DIR/frontend" && npm run dev -- --host 0.0.0.0 --port 5173) >"$FRONTEND_LOG" 2>&1 &
  FRONTEND_PID=$!
fi

LAN_IP=""
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi

echo "本机/LAN 访问："
echo "- 前端：http://${LAN_IP:-127.0.0.1}:5173"
echo "- 后端：http://${LAN_IP:-127.0.0.1}:8088"

echo "等待服务就绪..."
FRONTEND_READY=0
BACKEND_READY=0

if wait_http "http://127.0.0.1:5173/" 120; then
  FRONTEND_READY=1
  echo "- 前端就绪"
else
  echo "- 前端 120s 内未就绪，停止启动外网隧道"
  echo "- 请查看日志：$FRONTEND_LOG"
  tail -n 60 "$FRONTEND_LOG" 2>/dev/null || true
  exit 1
fi

if wait_http "http://127.0.0.1:8088/" 240; then
  BACKEND_READY=1
  echo "- 后端就绪"
else
  echo "- 后端 240s 内未就绪，将只开放前端外网（API 会 502）"
  echo "- 请查看日志：$BACKEND_LOG"
  tail -n 60 "$BACKEND_LOG" 2>/dev/null || true
fi

if command -v cloudflared >/dev/null 2>&1; then
  echo "[3/3] 启动 Cloudflare Tunnel (外网访问) ..."

  TUNNEL_WEB_LOG="$RUN_DIR/tunnel-web.log"
  TUNNEL_API_LOG="$RUN_DIR/tunnel-api.log"
  : >"$TUNNEL_WEB_LOG"
  : >"$TUNNEL_API_LOG"

  (cloudflared tunnel --no-autoupdate --url http://127.0.0.1:5173 2>&1 | tee -a "$TUNNEL_WEB_LOG") &
  TUNNEL_WEB_PID=$!

  if [[ "$BACKEND_READY" -eq 1 ]]; then
    (cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8088 2>&1 | tee -a "$TUNNEL_API_LOG") &
    TUNNEL_API_PID=$!
  fi

  WEB_URL=""
  API_URL=""
  for _ in $(seq 1 180); do
    if [[ -z "$WEB_URL" ]]; then
      WEB_URL="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$TUNNEL_WEB_LOG" | tail -n 1 || true)"
    fi
    if [[ -z "$API_URL" && "$BACKEND_READY" -eq 1 ]]; then
      API_URL="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$TUNNEL_API_LOG" | tail -n 1 || true)"
    fi
    if [[ -n "$WEB_URL" && ( "$BACKEND_READY" -eq 0 || -n "$API_URL" ) ]]; then
      {
        echo "WEB=${WEB_URL}"
        echo "API=${API_URL}"
      } >"$PUBLIC_URL_FILE"
      echo "外网访问："
      echo "- 前端：${WEB_URL}"
      if [[ "$BACKEND_READY" -eq 1 ]]; then
        echo "- 后端：${API_URL}"
      fi
      break
    fi
    sleep 0.5
  done

  TUNNEL_LOG="$RUN_DIR/tunnel.log"
  cat "$TUNNEL_WEB_LOG" "$TUNNEL_API_LOG" >"$TUNNEL_LOG" 2>/dev/null || true
else
  echo "未检测到 cloudflared，已跳过外网隧道。"
  echo "如需外网访问：安装 cloudflared 后再运行此脚本。"
fi

echo "进程已启动。按 Ctrl+C 退出并自动停止。"
echo "注意：终端退出/电脑休眠后，外网地址会变成 502。"
wait
