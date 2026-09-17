#!/usr/bin/env bash
# =====================================================================
# 自动拉取部署机器人（D-430）：由 cron 每 2 分钟调用
# 有新代码 → 拉取；backend/ 或 frontend/ 有变动才重建对应容器
# miniprogram/文档类改动只拉代码不重建（省 7 分钟构建）
# =====================================================================
set -e
exec 9>/tmp/autodeploy.lock
flock -n 9 || exit 0   # 上一次还没跑完就静默退出，防重叠

cd /opt/fz66666
git fetch origin main -q || exit 0
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# ── phpMyAdmin 接管巡检（D-433，幂等）：历史手动 docker run 的容器由 compose 接管 ──
# 放在版本判断前：接管未成功时每轮自动重试。顺序保证零风险——
# 先起 compose 版（与手动容器并存，Caddy 对上游名轮询无感），启动成功后才移除手动容器；
# 启动失败则保留手动容器继续服务，绝不先删后建。
PMA_COMPOSE="deploy/lighthouse/docker-compose.yml"
if [ -f "$PMA_COMPOSE" ] && grep -q '^  phpmyadmin:' "$PMA_COMPOSE" 2>/dev/null \
   && ! sudo docker compose -f "$PMA_COMPOSE" ps -q phpmyadmin 2>/dev/null | grep -q .; then
  echo "[$(date '+%F %T')] phpMyAdmin 尚未由 compose 管理，执行接管..."
  if sudo docker compose -f "$PMA_COMPOSE" up -d phpmyadmin; then
    sudo docker rm -f phpmyadmin 2>/dev/null || true
    echo "[$(date '+%F %T')] ✅ phpMyAdmin 已由 compose 接管（手动容器已移除）"
  else
    echo "[$(date '+%F %T')] ⚠️ phpmyadmin compose 启动失败，保留现有容器，下轮重试"
  fi
fi

[ "$LOCAL" = "$REMOTE" ] && exit 0

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" || true)

# ── 资源守卫（D-453，2026-09-17 P0 事故教训）──
# 构建极耗内存（Maven ~2G + Vite ~1.5G），而机器上还跑着全栈；可用内存不足时跳过本轮，防整机假死
AVAIL_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
if [ "${AVAIL_MB:-9999}" -lt 1200 ]; then
  echo "[$(date '+%F %T')] ⚠️ 可用内存仅 ${AVAIL_MB}MB < 1200MB，跳过本轮构建（防过载假死），下轮自动重试"
  exit 0
fi

git pull --ff-only origin main -q || exit 0
echo "[$(date '+%F %T')] 检测到更新 $LOCAL..$REMOTE"

cd deploy/lighthouse

# 把刚拉到的 commit 写进 .env，供 compose 构建前端时注入版本水印（登录页"部署版本"）
COMMIT=$(git -C /opt/fz66666 rev-parse --short HEAD)
if grep -q '^GIT_COMMIT=' .env 2>/dev/null; then
  sed -i "s|^GIT_COMMIT=.*|GIT_COMMIT=$COMMIT|" .env || true
else
  echo "GIT_COMMIT=$COMMIT" >> .env || true
fi

SERVICES=""
RESTART_CADDY=0
echo "$CHANGED" | grep -q '^backend/'  && SERVICES="$SERVICES backend"
echo "$CHANGED" | grep -q '^frontend/' && SERVICES="$SERVICES frontend"
echo "$CHANGED" | grep -q '^deploy/lighthouse/Caddyfile$'         && RESTART_CADDY=1
echo "$CHANGED" | grep -q '^deploy/lighthouse/docker-compose.yml$' && RESTART_CADDY=1
echo "$CHANGED" | grep -q '^deploy/lighthouse/' && SERVICES="$SERVICES backend frontend"

if [ -n "$SERVICES" ]; then
  # ── 串行构建（D-453，2026-09-17 P0）：Maven 与 Vite 并行构建曾把 8G 全栈机器打到假死，必须逐个来 ──
  # 顺序固定 backend → frontend：后端构建期间旧容器继续服务，新后端先起来健康了，再动前端
  for S in backend frontend; do
    case " $SERVICES " in
      *" $S "*)
        echo "[$(date '+%F %T')] 串行构建 $S ..."
        if ! sudo docker compose up -d --build "$S"; then
          echo "[$(date '+%F %T')] ❌ $S 构建失败，中止本轮（后续轮次重试），旧容器继续服务"
          exit 1
        fi
        if [ "$S" = "backend" ]; then
          for i in $(seq 1 30); do
            if sudo docker compose exec -T backend curl -sf http://localhost:8088/actuator/health >/dev/null 2>&1; then
              echo "[$(date '+%F %T')] ✅ backend healthy"; break
            fi
            sleep 10
          done
        fi
        ;;
    esac
  done
else
  echo "[$(date '+%F %T')] 变更不涉及 backend/frontend，跳过构建"
fi

if [ "$RESTART_CADDY" = 1 ]; then
  sudo docker compose restart caddy
  echo "[$(date '+%F %T')] caddy 已重启（配置变更）"
fi
