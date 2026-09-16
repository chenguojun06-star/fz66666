#!/usr/bin/env bash
# =====================================================================
# 轻量服务器一次性初始化（root 运行）
# 用法：把本脚本传到服务器任意位置，bash bootstrap-server.sh
# 前提：已购买腾讯云轻量服务器（Ubuntu 22.04/24.04），防火墙已放行 22/80/443
# =====================================================================
set -e

echo "── 1/5 安装 Docker（含 compose 插件）──"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
fi
docker compose version || { echo "compose 插件缺失"; exit 1; }

echo "── 2/5 克隆仓库 ──"
if [ ! -d /opt/fz66666 ]; then
  git clone https://github.com/chenguojun06-star/fz66666.git /opt/fz66666
fi
cd /opt/fz66666
git pull --rebase origin main || true

echo "── 3/5 准备 .env.backend ──"
if [ ! -f deploy/lighthouse/.env.backend ]; then
  cat > deploy/lighthouse/.env.backend <<'TPL'
# ★ 从 微信云托管控制台 → backend → 服务设置 → 环境变量 整份复制到这里，
#   然后只需确认/修改以下三处指向（其余 DEEPSEEK_API_KEY 等全部原样保留）：
# APP_DB_USERNAME=root
# APP_DB_PASSWORD=<与下方 MYSQL_ROOT_PASSWORD 一致>
# APP_DB_NAME=fashion_supplychain
# SPRING_REDIS_PASSWORD=(服务器内网 redis 未设密码则留空)
#
# MYSQL_ROOT_PASSWORD 供 docker-compose 使用，写在本目录 .env 文件里：
#   echo "MYSQL_ROOT_PASSWORD=你的密码" > deploy/lighthouse/.env
TPL
  echo "已生成模板 deploy/lighthouse/.env.backend —— 请填入云托管环境变量后再继续"
  exit 0
fi

echo "── 4/5 启动基础组件（MySQL/Redis/Qdrant）──"
docker compose -f deploy/lighthouse/docker-compose.yml up -d mysql redis qdrant
echo "等待 MySQL 健康检查通过..."
for i in $(seq 1 30); do
  docker compose -f deploy/lighthouse/docker-compose.yml exec -T mysql mysqladmin ping -uroot -p"$(grep MYSQL_ROOT_PASSWORD deploy/lighthouse/.env | cut -d= -f2)" --silent && break
  sleep 5
done

echo "── 5/5 完成 ──"
echo "下一步（见 README.md 第4节）："
echo "  1) 把云托管导出的 SQL 导入: docker compose -f deploy/lighthouse/docker-compose.yml exec -T mysql mysql -uroot -p<密码> fashion_supplychain < dump.sql"
echo "  2) bash deploy/lighthouse/deploy-app.sh   # 启动 backend/frontend/caddy"
