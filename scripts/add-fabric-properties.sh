#!/bin/bash

# ================================================================
# 面辅料库存表 - 添加面料属性字段
# 创建时间：2026-02-05
# 说明：为面料物料添加幅宽、克重、成分三个属性字段
# ================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL_FILE="$SCRIPT_DIR/add-fabric-properties.sql"
DOCKER_CONTAINER="fashion-mysql-simple"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}🔧 面料属性字段迁移脚本${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# 1. 检查 Docker 容器
echo -e "${YELLOW}📝 步骤 1: 检查 MySQL 容器...${NC}"
if ! docker ps | grep -q "$DOCKER_CONTAINER"; then
  echo -e "${RED}❌ Docker 容器 $DOCKER_CONTAINER 未运行${NC}"
  echo "请先启动容器: ./deployment/db-manager.sh start"
  exit 1
fi
echo -e "${GREEN}✅ 容器运行正常${NC}"
echo ""

# 2. 测试数据库连接
echo -e "${YELLOW}📝 步骤 2: 测试数据库连接...${NC}"
if ! docker exec "$DOCKER_CONTAINER" mysql -h127.0.0.1 -u"$DB_USER" -p"$DB_PASS" -e "SELECT 1" > /dev/null 2>&1; then
  echo -e "${RED}❌ 数据库连接失败${NC}"
  exit 1
fi
echo -e "${GREEN}✅ 数据库连接成功${NC}"
echo ""

# 3. 检查表是否存在
echo -e "${YELLOW}📝 步骤 3: 检查 t_material_stock 表...${NC}"
TABLE_EXISTS=$(docker exec "$DOCKER_CONTAINER" mysql -h127.0.0.1 -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  -e "SHOW TABLES LIKE 't_material_stock';" | grep -c "t_material_stock" || true)

if [ "$TABLE_EXISTS" -eq 0 ]; then
  echo -e "${RED}❌ 表 t_material_stock 不存在${NC}"
  exit 1
fi
echo -e "${GREEN}✅ 表存在${NC}"
echo ""

# 4. 检查字段是否已存在
echo -e "${YELLOW}📝 步骤 4: 检查字段是否已存在...${NC}"
FIELD_EXISTS=$(docker exec "$DOCKER_CONTAINER" mysql -h127.0.0.1 -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  -e "SHOW COLUMNS FROM t_material_stock LIKE 'fabric_width';" | grep -c "fabric_width" || true)

if [ "$FIELD_EXISTS" -gt 0 ]; then
  echo -e "${YELLOW}⚠️ 字段 fabric_width 已存在，跳过迁移${NC}"
  echo ""

  # 显示当前字段
  echo -e "${BLUE}当前面料属性字段：${NC}"
  docker exec "$DOCKER_CONTAINER" mysql -h127.0.0.1 -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
    -e "SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='t_material_stock' AND COLUMN_NAME IN ('fabric_width', 'fabric_weight', 'fabric_composition');"

  exit 0
fi
echo -e "${GREEN}✅ 字段不存在，可以继续${NC}"
echo ""

# 5. 显示将要执行的 SQL
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}📋 将要执行的 SQL:${NC}"
echo -e "${BLUE}======================================${NC}"
cat "$SQL_FILE" | grep -v "^--" | grep -v "^$"
echo ""

# 6. 备份提醒
echo -e "${YELLOW}⚠️ 重要提示：${NC}"
echo "1. 此操作将修改数据库表结构"
echo "2. 建议先在测试环境验证"
echo "3. 生产环境执行前请备份数据库"
echo ""
echo "备份命令："
echo "  docker exec $DOCKER_CONTAINER mysqldump -u$DB_USER -p$DB_PASS $DB_NAME > backup_\$(date +%Y%m%d_%H%M%S).sql"
echo ""

# 7. 用户确认
read -p "是否继续执行迁移？(yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo -e "${YELLOW}⏸️ 用户取消操作${NC}"
  exit 0
fi
echo ""

# 8. 执行 SQL 脚本
echo -e "${YELLOW}📝 步骤 5: 执行数据库迁移...${NC}"
if docker exec -i "$DOCKER_CONTAINER" mysql -h127.0.0.1 -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$SQL_FILE"; then
  echo -e "${GREEN}✅ SQL 脚本执行成功${NC}"
else
  echo -e "${RED}❌ SQL 脚本执行失败${NC}"
  exit 1
fi
echo ""

# 9. 验证结果
echo -e "${YELLOW}📝 步骤 6: 验证迁移结果...${NC}"
echo ""
echo -e "${BLUE}新增字段信息：${NC}"
docker exec "$DOCKER_CONTAINER" mysql -h127.0.0.1 -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  -e "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_COMMENT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='t_material_stock' AND COLUMN_NAME IN ('fabric_width', 'fabric_weight', 'fabric_composition') ORDER BY ORDINAL_POSITION;"
echo ""

# 10. 完成
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}🎉 迁移完成！${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "${BLUE}📋 后续步骤：${NC}"
echo "1. 重启后端服务使新字段生效"
echo "   ./dev-public.sh"
echo ""
echo "2. 在前端入库时可以填写面料属性"
echo "   - 幅宽 (fabric_width)"
echo "   - 克重 (fabric_weight)"
echo "   - 成分 (fabric_composition)"
echo ""
echo "3. 表格列已自动显示面料属性"
echo ""
