#!/bin/bash

# 数据库备份脚本
# 用法: ./backup-database.sh

# 配置
CONTAINER_NAME="fashion-mysql-simple"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASSWORD="changeme"
BACKUP_DIR="./backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p "$BACKUP_DIR"

echo "开始备份数据库..."

# 执行备份
docker exec $CONTAINER_NAME mysqldump -u$DB_USER -p$DB_PASSWORD $DB_NAME > "$BACKUP_DIR/backup_$DATE.sql"

if [ $? -eq 0 ]; then
    echo "✅ 备份成功: $BACKUP_DIR/backup_$DATE.sql"
    
    # 压缩备份文件
    gzip "$BACKUP_DIR/backup_$DATE.sql"
    echo "✅ 已压缩: $BACKUP_DIR/backup_$DATE.sql.gz"
    
    # 保留最近10个备份，删除旧备份
    ls -t "$BACKUP_DIR"/backup_*.sql.gz | tail -n +11 | xargs -r rm
    echo "✅ 已清理旧备份（保留最近10个）"
    
    # 显示备份文件大小
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/backup_$DATE.sql.gz" | cut -f1)
    echo "📦 备份大小: $BACKUP_SIZE"
else
    echo "❌ 备份失败"
    exit 1
fi
