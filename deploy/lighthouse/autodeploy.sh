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
[ "$LOCAL" = "$REMOTE" ] && exit 0

CHANGED=$(git diff --name-only "$LOCAL" "$REMOTE" || true)
git pull --ff-only origin main -q || exit 0
echo "[$(date '+%F %T')] 检测到更新 $LOCAL..$REMOTE"

cd deploy/lighthouse
SERVICES=""
echo "$CHANGED" | grep -q '^backend/'  && SERVICES="$SERVICES backend"
echo "$CHANGED" | grep -q '^frontend/' && SERVICES="$SERVICES frontend"
echo "$CHANGED" | grep -q '^deploy/lighthouse/' && SERVICES=" backend frontend"

if [ -n "$SERVICES" ]; then
  sudo docker compose up -d --build $SERVICES
  for i in $(seq 1 30); do
    if sudo docker compose exec -T backend curl -sf http://localhost:8088/actuator/health >/dev/null 2>&1; then
      echo "[$(date '+%F %T')] ✅ backend healthy"; break
    fi
    sleep 10
  done
else
  echo "[$(date '+%F %T')] 变更不涉及 backend/frontend，跳过构建"
fi
