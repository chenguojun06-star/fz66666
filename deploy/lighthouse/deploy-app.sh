#!/usr/bin/env bash
# 启动应用层（backend/frontend/caddy）—— 数据导入完成后执行
set -e
cd "$(dirname "$0")"
docker compose up -d --build caddy frontend backend
echo "等待后端健康（首次启动约 3~5 分钟）..."
for i in $(seq 1 60); do
  if docker compose exec -T backend curl -sf http://localhost:8088/actuator/health >/dev/null 2>&1; then
    echo "✅ backend healthy"
    docker compose ps
    exit 0
  fi
  sleep 10
done
echo "❌ 健康检查超时，查看日志: docker compose logs backend --tail 100"
exit 1
