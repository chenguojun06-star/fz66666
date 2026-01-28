#!/bin/bash

# 样板生产自动创建功能验证脚本
# 用途：快速验证后端自动创建逻辑和数据库完整性

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}  样板生产自动创建功能验证${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""

# 1. 检查数据库表
echo -e "${YELLOW}[1/4]${NC} 检查数据库表..."
TABLE_EXISTS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -sN \
  -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='fashion_supplychain' AND TABLE_NAME='t_pattern_production';")

if [ "$TABLE_EXISTS" -eq 1 ]; then
  echo -e "${GREEN}✓${NC} 表 t_pattern_production 存在"
else
  echo -e "${RED}✗${NC} 表 t_pattern_production 不存在！"
  echo -e "${YELLOW}提示${NC}: 运行 docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < scripts/create_pattern_production_table.sql"
  exit 1
fi

# 2. 检查后端服务
echo -e "${YELLOW}[2/4]${NC} 检查后端服务..."
if ps aux | grep "spring-boot" | grep -v grep > /dev/null; then
  echo -e "${GREEN}✓${NC} Spring Boot 服务正在运行"
else
  echo -e "${RED}✗${NC} 后端服务未启动！"
  echo -e "${YELLOW}提示${NC}: 运行 ./dev-public.sh 或 cd backend && mvn spring-boot:run"
  exit 1
fi

# 3. 查询现有样板生产记录
echo -e "${YELLOW}[3/4]${NC} 查询现有样板生产记录..."
COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -sN \
  -e "SELECT COUNT(*) FROM t_pattern_production;")

echo -e "${GREEN}✓${NC} 当前样板生产记录数: ${COUNT}"

if [ "$COUNT" -gt 0 ]; then
  echo -e "${YELLOW}最新 3 条记录:${NC}"
  docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -t \
    -e "SELECT id, style_no, status, progress_nodes, create_time FROM t_pattern_production ORDER BY create_time DESC LIMIT 3;"
fi

# 4. 测试API可达性
echo -e "${YELLOW}[4/4]${NC} 测试 API 可达性..."
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080/production/pattern/list?page=1&pageSize=10" \
  -H "Authorization: Bearer test_token_placeholder" || echo "000")

if [ "$API_RESPONSE" -eq 200 ] || [ "$API_RESPONSE" -eq 401 ]; then
  echo -e "${GREEN}✓${NC} API 端点可达 (状态码: ${API_RESPONSE})"
  if [ "$API_RESPONSE" -eq 401 ]; then
    echo -e "${YELLOW}⚠${NC}  需要登录后才能访问 (401 Unauthorized)"
  fi
else
  echo -e "${RED}✗${NC} API 无法访问 (状态码: ${API_RESPONSE})"
fi

echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${GREEN}验证完成！${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo -e "${YELLOW}下一步测试流程:${NC}"
echo "1. 访问 http://localhost:5173/#/style-info"
echo "2. 创建新的样衣开发记录（款号: TEST_AUTO_001）"
echo "3. 访问 http://localhost:5173/#/pattern-production"
echo "4. 验证是否自动创建了对应的样板生产记录"
echo ""
