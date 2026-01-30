#!/bin/bash

# 工序指派字段迁移脚本
# 用法: ./migrate-delegate-fields.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SQL_FILE="$PROJECT_ROOT/scripts/migration-add-delegate-fields.sql"

echo "=================================="
echo "工序指派字段迁移"
echo "=================================="
echo ""

# 检查 SQL 文件是否存在
if [ ! -f "$SQL_FILE" ]; then
    echo "❌ 错误: 找不到 SQL 文件: $SQL_FILE"
    exit 1
fi

echo "📄 SQL 文件: $SQL_FILE"
echo ""

# 检查 Docker 容器是否运行
if ! docker ps | grep -q fashion-mysql-simple; then
    echo "❌ 错误: MySQL Docker 容器未运行"
    echo "请先启动: docker start fashion-mysql-simple"
    exit 1
fi

echo "✅ MySQL 容器正在运行"
echo ""

# 备份数据库
echo "📦 开始备份数据库..."
BACKUP_FILE="$PROJECT_ROOT/deployment/backups/before-delegate-migration-$(date +%Y%m%d_%H%M%S).sql"
mkdir -p "$PROJECT_ROOT/deployment/backups"

docker exec fashion-mysql-simple mysqldump \
    -u root -pchangeme \
    --single-transaction \
    --routines \
    --triggers \
    fashion_supplychain > "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "✅ 备份成功: $BACKUP_FILE"
else
    echo "❌ 备份失败"
    exit 1
fi
echo ""

# 执行迁移
echo "🚀 开始执行数据库迁移..."
echo ""

docker exec -i fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "=================================="
    echo "✅ 迁移成功完成！"
    echo "=================================="
    echo ""
    echo "📊 数据统计:"
    docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain -e "
        SELECT
            COUNT(*) AS '总记录数',
            SUM(CASE WHEN delegate_target_type = 'none' THEN 1 ELSE 0 END) AS '未指派',
            SUM(CASE WHEN delegate_target_type = 'internal' THEN 1 ELSE 0 END) AS '内部指派',
            SUM(CASE WHEN delegate_target_type = 'external' THEN 1 ELSE 0 END) AS '外部指派',
            SUM(CASE WHEN actual_operator_id IS NOT NULL THEN 1 ELSE 0 END) AS '有实际操作员'
        FROM t_scan_record;
    "
    echo ""
    echo "🎉 下一步:"
    echo "   1. 重启后端服务以加载新字段"
    echo "   2. 测试工序指派功能"
    echo "   3. 查看工资结算是否正确"
    echo ""
else
    echo ""
    echo "=================================="
    echo "❌ 迁移失败"
    echo "=================================="
    echo ""
    echo "🔧 恢复备份:"
    echo "   docker exec -i fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain < $BACKUP_FILE"
    echo ""
    exit 1
fi
