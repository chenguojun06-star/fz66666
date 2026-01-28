#!/bin/bash

# 样板生产功能快速测试脚本
# 用途：创建测试数据并验证完整流程

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  样板生产功能快速测试${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 数据库配置
DB_HOST="localhost"
DB_PORT="3308"
DB_USER="root"
DB_PASS="changeme"
DB_NAME="fashion_supplychain"

# 生成随机测试款号
TEST_STYLE_NO="TEST_$(date +%Y%m%d%H%M%S)"

echo -e "${YELLOW}[1/5]${NC} 创建测试样衣开发记录..."
echo -e "       款号: ${GREEN}${TEST_STYLE_NO}${NC}"

# 插入样衣开发记录
docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF
INSERT INTO t_style_info (
  style_no,
  style_name,
  category,
  season,
  create_time,
  update_time,
  delete_flag
) VALUES (
  '${TEST_STYLE_NO}',
  '自动测试-样板生产流程',
  '上装',
  '春季',
  NOW(),
  NOW(),
  0
);
EOF

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓${NC} 样衣开发记录创建成功"
else
  echo -e "${RED}✗${NC} 创建失败！"
  exit 1
fi

# 获取刚创建的styleId
STYLE_ID=$(docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} -sN \
  -e "SELECT id FROM t_style_info WHERE style_no = '${TEST_STYLE_NO}' LIMIT 1;")

echo -e "       Style ID: ${STYLE_ID}"
sleep 2

echo -e "${YELLOW}[2/5]${NC} 验证样板生产记录是否自动创建..."

PATTERN_COUNT=$(docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} -sN \
  -e "SELECT COUNT(*) FROM t_pattern_production WHERE style_no = '${TEST_STYLE_NO}';")

if [ "$PATTERN_COUNT" -eq 1 ]; then
  echo -e "${GREEN}✓${NC} 样板生产记录自动创建成功"
else
  echo -e "${RED}✗${NC} 自动创建失败！预期1条，实际${PATTERN_COUNT}条"
  exit 1
fi

# 获取样板生产ID
PATTERN_ID=$(docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} -sN \
  -e "SELECT id FROM t_pattern_production WHERE style_no = '${TEST_STYLE_NO}' LIMIT 1;")

echo -e "       Pattern ID: ${PATTERN_ID}"

echo -e "${YELLOW}[3/5]${NC} 检查初始状态..."
docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} -t <<EOF
SELECT
  id,
  style_no,
  status,
  progress_nodes,
  receiver,
  receive_time
FROM t_pattern_production
WHERE style_no = '${TEST_STYLE_NO}';
EOF

echo -e "${YELLOW}[4/5]${NC} 模拟领取样板..."
docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF
UPDATE t_pattern_production SET
  status = 'IN_PROGRESS',
  receiver = 'test_user',
  receive_time = NOW(),
  update_time = NOW()
WHERE id = ${PATTERN_ID};
EOF

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓${NC} 领取成功，状态已更新为 IN_PROGRESS"
else
  echo -e "${RED}✗${NC} 领取失败！"
  exit 1
fi

echo -e "${YELLOW}[5/5]${NC} 模拟完成所有工序..."
docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} <<EOF
UPDATE t_pattern_production SET
  status = 'COMPLETED',
  progress_nodes = '{"cutting":100,"sewing":100,"ironing":100,"quality":100,"secondary":100,"packaging":100}',
  complete_time = NOW(),
  update_time = NOW()
WHERE id = ${PATTERN_ID};
EOF

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓${NC} 所有工序已完成，状态已更新为 COMPLETED"
else
  echo -e "${RED}✗${NC} 更新失败！"
  exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}测试完成！${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${YELLOW}📊 测试结果摘要:${NC}"
docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} -t <<EOF
SELECT
  id,
  style_no,
  status,
  receiver,
  DATE_FORMAT(receive_time, '%Y-%m-%d %H:%i:%s') as receive_time,
  DATE_FORMAT(complete_time, '%Y-%m-%d %H:%i:%s') as complete_time,
  progress_nodes
FROM t_pattern_production
WHERE style_no = '${TEST_STYLE_NO}';
EOF

echo ""
echo -e "${YELLOW}🔗 前端测试链接:${NC}"
echo -e "   样板生产列表: ${BLUE}http://localhost:5173/#/pattern-production${NC}"
echo -e "   搜索款号: ${GREEN}${TEST_STYLE_NO}${NC}"
echo ""
echo -e "${YELLOW}🗑️  清理测试数据（可选）:${NC}"
echo -e "   docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \\"
echo -e "     -e \"DELETE FROM t_pattern_production WHERE style_no = '${TEST_STYLE_NO}';\""
echo -e "   docker exec fashion-mysql-simple mysql -u${DB_USER} -p${DB_PASS} ${DB_NAME} \\"
echo -e "     -e \"DELETE FROM t_style_info WHERE style_no = '${TEST_STYLE_NO}';\""
echo ""
