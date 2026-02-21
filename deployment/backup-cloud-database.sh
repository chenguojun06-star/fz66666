#!/bin/bash
# ============================================================
# 云数据库备份脚本（腾讯云 CynosDB）
# 用法：./backup-cloud-database.sh
# 建议：配置 Mac 定时任务每天自动执行（见脚本末尾说明）
# ============================================================

# 云 MySQL 连接信息
DB_HOST="sh-cynosdbmysql-grp-2bpr255g.sql.tencentcdb.com"
DB_PORT="28800"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASSWORD="cC1997112"

# 备份存到当前 Mac 本地（可改成其他路径，如移动硬盘）
BACKUP_DIR="$HOME/Documents/服装数据库备份"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/fashion_${DATE}.sql"

mkdir -p "$BACKUP_DIR"

echo "================================================"
echo "  开始备份云数据库: $DB_NAME"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================"

# 执行备份
mysqldump \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  -p"$DB_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "$DB_NAME" > "$BACKUP_FILE"

if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    # 压缩
    gzip "$BACKUP_FILE"
    FINAL_FILE="${BACKUP_FILE}.gz"
    SIZE=$(du -h "$FINAL_FILE" | cut -f1)
    echo "✅ 备份成功: $FINAL_FILE"
    echo "📦 文件大小: $SIZE"

    # 只保留最近 30 个备份（约一个月）
    ls -t "$BACKUP_DIR"/fashion_*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm
    COUNT=$(ls "$BACKUP_DIR"/fashion_*.sql.gz 2>/dev/null | wc -l | tr -d ' ')
    echo "📁 当前共 $COUNT 个备份文件"
else
    echo "❌ 备份失败！请检查网络或数据库连接"
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "================================================"
echo "  备份完成"
echo "  路径: $BACKUP_DIR"
echo "================================================"

# ============================================================
# 配置每天 03:00 自动备份（Mac 定时任务）：
#
# 1. 终端执行：crontab -e
# 2. 添加这一行（改成你脚本的实际路径）：
#    0 3 * * * /bin/bash /你的路径/deployment/backup-cloud-database.sh >> $HOME/Documents/服装数据库备份/backup.log 2>&1
# 3. 保存退出
# ============================================================
