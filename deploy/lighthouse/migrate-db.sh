#!/usr/bin/env bash
# 数据库迁移：云托管 MySQL → 本服务器 MySQL
# 用法：bash migrate-db.sh <云托管MySQL公网域名> <端口>
set -e
CDB_HOST="$1"; CDB_PORT="${2:-3306}"
DB_USER="root"; DB_PASS='cC1997112'; DB_NAME="fashion_supplychain"
cd "$(dirname "$0")"
echo "── 1/3 从云托管导出（只读，几分钟）──"
docker run --rm mysql:8.0 mysqldump -h"$CDB_HOST" -P"$CDB_PORT" -u"$DB_USER" -p"$DB_PASS" \
  --single-transaction --routines --triggers "$DB_NAME" > /opt/dump.sql
ls -lh /opt/dump.sql
[ "$(stat -f%z /opt/dump.sql 2>/dev/null || stat -c%s /opt/dump.sql)" -lt 10000 ] && { echo "❌ dump 文件过小，检查公网域名/白名单"; exit 1; }
echo "── 2/3 导入本服务器 MySQL ──"
docker compose exec -T mysql mysql -uroot -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2-)" "$DB_NAME" < /opt/dump.sql
echo "── 3/3 核对行数 ──"
docker compose exec -T mysql mysql -uroot -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d= -f2-)" "$DB_NAME" \
  -e "SELECT 't_user' t,COUNT(*) c FROM t_user UNION ALL SELECT 't_production_order',COUNT(*) FROM t_production_order UNION ALL SELECT 't_style_info',COUNT(*) FROM t_style_info;"
echo "✅ 迁移完成，把上面行数发给 AI 对照线上"
