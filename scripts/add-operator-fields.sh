#!/bin/bash

# =================================================================
# 全系统操作人记录 - 数据库字段补充脚本
# 创建时间：2026-02-05
# 说明：执行 SQL 脚本，为各业务表添加操作人字段
# =================================================================

BASE_DIR=$(dirname "$0")
SQL_FILE="$BASE_DIR/../scripts/add-operator-fields.sql"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}📊 全系统操作人字段补充${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# 检查 SQL 文件是否存在
if [ ! -f "$SQL_FILE" ]; then
    echo -e "${RED}❌ 错误：SQL 文件不存在: $SQL_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}📝 准备执行的 SQL 文件：${NC}"
echo "   $SQL_FILE"
echo ""

# 数据库连接信息
DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_USER="root"
DB_PASS="changeme"
DB_NAME="fashion_supplychain"
CONTAINER_NAME="fashion-mysql-simple"

echo -e "${YELLOW}🔍 检查数据库连接...${NC}"

# 检查 Docker 容器是否运行
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}❌ 数据库容器未运行: $CONTAINER_NAME${NC}"
    echo "请先运行: ./deployment/db-manager.sh start"
    exit 1
fi

echo -e "${GREEN}✅ 数据库容器运行中${NC}"
echo ""

# 测试数据库连接
if ! docker exec $CONTAINER_NAME mysql -h$DB_HOST -u$DB_USER -p$DB_PASS -e "SELECT 1" > /dev/null 2>&1; then
    echo -e "${RED}❌ 数据库连接失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 数据库连接成功${NC}"
echo ""

# 备份提示
echo -e "${YELLOW}⚠️  重要提示：${NC}"
echo "   1. 此脚本将修改数据库表结构"
echo "   2. 建议先备份数据库"
echo "   3. 已添加的字段不会重复添加（使用 IF NOT EXISTS）"
echo ""

# 询问是否继续
read -p "是否继续执行？(y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⏸️  已取消执行${NC}"
    exit 0
fi

# 执行 SQL 脚本
echo -e "${BLUE}🚀 执行 SQL 脚本...${NC}"
echo ""

docker exec -i $CONTAINER_NAME mysql -h$DB_HOST -u$DB_USER -p$DB_PASS $DB_NAME < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}======================================${NC}"
    echo -e "${GREEN}✅ 操作人字段补充完成！${NC}"
    echo -e "${GREEN}======================================${NC}"
    echo ""

    echo -e "${BLUE}📋 已添加字段总结：${NC}"
    echo ""
    echo "1. t_cutting_task: operator_id, operator_name, is_outsourced"
    echo "2. t_pattern_revision: approver_id, approver_name, approved_at"
    echo "3. t_style_info: approved_by_id, approved_by_name, approved_at"
    echo "4. t_material_reconciliation: approved_by_id, approved_by_name, approved_at"
    echo "5. t_payroll_settlement: 审批人 + 支付人字段"
    echo "6. t_production_order: is_outsourced"
    echo "7. t_scan_record: is_outsourced"
    echo ""

    echo -e "${BLUE}📊 验证结果：${NC}"
    docker exec $CONTAINER_NAME mysql -h$DB_HOST -u$DB_USER -p$DB_PASS $DB_NAME \
        -e "SELECT
            (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = 'fashion_supplychain'
               AND table_name = 't_cutting_task'
               AND column_name IN ('operator_id', 'operator_name', 'is_outsourced')) AS 裁剪任务表,
            (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = 'fashion_supplychain'
               AND table_name = 't_pattern_revision'
               AND column_name IN ('approver_id', 'approver_name', 'approved_at')) AS 样板生产表,
            (SELECT COUNT(*) FROM information_schema.columns
             WHERE table_schema = 'fashion_supplychain'
               AND table_name = 't_style_info'
               AND column_name IN ('approved_by_id', 'approved_by_name', 'approved_at')) AS 款式管理表,
            (SELECT COUNT(*) FROM t_production_order WHERE is_outsourced = 1) AS 外协订单数量;"

    echo ""
    echo -e "${GREEN}🎉 下一步：重启后端应用新代码${NC}"
    echo "   ./dev-public.sh"
    echo ""
else
    echo ""
    echo -e "${RED}======================================${NC}"
    echo -e "${RED}❌ SQL 执行失败${NC}"
    echo -e "${RED}======================================${NC}"
    echo ""
    echo "请检查错误信息并手动修复"
    exit 1
fi
