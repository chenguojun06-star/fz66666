#!/bin/bash
# 云端健康诊断（只读脚本，不修改任何数据）
#
# 用途：一次性看清 5 件事：
#   1. 容器都活着吗
#   2. MySQL 连接数是否正常（连接池耗尽的核心指标）
#   3. 向量回灌任务是否还在跑
#   4. Qdrant 集合是否还在（历史上丢过一次）
#   5. 后端还在不在报错
#
# 用法：在项目根目录执行  ./check-cloud-health.sh
#
# 连接方式：ubuntu + 密钥（deploy/lighthouse/README.md 记录的部署机身份）。
# 密钥默认 ~/.ssh/fz66666_backup，可用 SSH_KEY 覆盖：
#   SSH_KEY=~/.ssh/其他密钥 ./check-cloud-health.sh
#
# ⚠️ IP/用户必须是当前生产机。历史版本这里写的是 106.53.5.62 + root，
#    与实际生产机不符：会连到错误主机，且 root 密码登录不可用时会卡在交互提示，
#    诊断脚本反而成了故障时的第一道障碍。改服务器前请先核对
#    deploy/lighthouse/README.md 里的当前 IP。
#
# 说明：ubuntu 用户不在 docker 组，故所有 docker 命令都走 sudo
#      （autodeploy.sh 里同样是这个约定，见该脚本第 76 行的注释）。

set -uo pipefail

CLOUD_IP="${CLOUD_IP:-106.55.12.216}"
CLOUD_USER="${CLOUD_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/fz66666_backup}"

if [ ! -f "$SSH_KEY" ]; then
  echo "❌ 找不到 SSH 密钥：$SSH_KEY"
  echo "   可用 SSH_KEY=~/.ssh/你的密钥 ./check-cloud-health.sh 覆盖"
  exit 1
fi

echo "正在连接 $CLOUD_USER@$CLOUD_IP （密钥 ${SSH_KEY}）..."
echo ""

ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
    "$CLOUD_USER@$CLOUD_IP" 'bash -s' <<'REMOTE_SCRIPT'

echo "════════ 1. 容器状态 ════════"
sudo docker ps --format "table {{.Names}}\t{{.Status}}" 2>/dev/null | head -20

echo ""
echo "════════ 2. MySQL 连接数（连接池耗尽的核心指标）════════"
MYSQL_C=$(sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -i mysql | head -1)
if [ -n "$MYSQL_C" ]; then
  echo "容器: $MYSQL_C"
  sudo docker exec "$MYSQL_C" sh -c '
    PW="${MYSQL_ROOT_PASSWORD:-changeme}"
    mysql -uroot -p"$PW" -e "
      SELECT VARIABLE_NAME, VARIABLE_VALUE
      FROM performance_schema.global_status
      WHERE VARIABLE_NAME IN (\"Threads_connected\",\"Threads_running\");
      SELECT @@max_connections AS max_connections;
    " 2>/dev/null
  ' || echo "  (取不到，请手动执行：sudo docker exec $MYSQL_C mysql -uroot -p密码 -e 'SHOW STATUS LIKE \"Threads_connected\";')"
else
  echo "  ⚠️ 没找到 MySQL 容器"
fi

echo ""
echo "════════ 3. 向量回灌任务状态 ════════"
REDIS_C=$(sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -i redis | head -1)
if [ -n "$REDIS_C" ]; then
  echo "容器: $REDIS_C"
  echo -n "  款式图片回灌 完成标记(done:v3) = "
  sudo docker exec "$REDIS_C" redis-cli GET style-vector-backfill:done:v3 2>/dev/null || echo "(取不到)"
  echo -n "  款式图片回灌 进度(offset:v3)   = "
  sudo docker exec "$REDIS_C" redis-cli GET style-vector-backfill:offset:v3 2>/dev/null || echo "(取不到)"
  echo -n "  sparse重灌 完成标记(done:v1)   = "
  sudo docker exec "$REDIS_C" redis-cli GET sparse-vector-backfill:done:v1 2>/dev/null || echo "(取不到)"
  echo "  ↑ 标记=1 表示已跑完；为空表示没跑过或还在跑"
else
  echo "  ⚠️ 没找到 Redis 容器"
fi

echo ""
echo "════════ 4. Qdrant 集合 ════════"
QDRANT_C=$(sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -i qdrant | head -1)
if [ -n "$QDRANT_C" ]; then
  echo "容器: $QDRANT_C"
  # ⚠️ qdrant 镜像内无 curl/wget，且该容器不映射端口 → 直接 exec 探测恒为空输出
  #    （2026-10-02 实测踩坑：空输出会被误读成「集合丢了」）。借同网络内有 HTTP
  #    客户端的容器探测：backend 含 curl、caddy 含 curl/wget。
  PROBE_C=$(sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -iE 'backend|caddy' | head -1)
  if [ -n "$PROBE_C" ]; then
    sudo docker exec "$PROBE_C" curl -s -m 8 "http://${QDRANT_C}:6333/collections" 2>/dev/null | head -c 600
    echo ""
    echo "  （探测容器: $PROBE_C；期望看到 fashion_memory / style_images 两个集合）"
  else
    echo "  ⚠️ 找不到含 curl/wget 的探测容器，无法读取集合列表"
  fi
  echo ""
else
  echo "  ⚠️ 没找到 Qdrant 容器"
fi

echo ""
echo "════════ 5. 后端最近日志（看是否还在刷错）════════"
BACKEND_C=$(sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -i backend | head -1)
if [ -n "$BACKEND_C" ]; then
  echo "容器: $BACKEND_C"
  sudo docker logs --tail=25 "$BACKEND_C" 2>&1 | tail -25
else
  echo "  ⚠️ 没找到 backend 容器"
fi

echo ""
echo "════════ 诊断结束 ════════"
REMOTE_SCRIPT

echo ""
echo "把上面输出整段发给我，我帮你判断哪里有问题、下一步做什么。"
