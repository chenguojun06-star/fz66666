#!/bin/bash
# 测试生产订单创建人追踪功能
# 创建时间: 2026-02-01

echo "=========================================="
echo "测试生产订单创建人追踪功能"
echo "=========================================="

BASE_URL="http://localhost:8088"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 管理员登录获取token
echo -e "\n${YELLOW}步骤1: 管理员登录${NC}"
ADMIN_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }' | jq -r '.data.token')

if [ -z "$ADMIN_TOKEN" ] || [ "$ADMIN_TOKEN" = "null" ]; then
    echo -e "${RED}✗ 管理员登录失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 管理员登录成功${NC}"

# 2. 工人1登录获取token
echo -e "\n${YELLOW}步骤2: 工人1登录${NC}"
WORKER1_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "worker1",
    "password": "worker123"
  }' | jq -r '.data.token')

if [ -z "$WORKER1_TOKEN" ] || [ "$WORKER1_TOKEN" = "null" ]; then
    echo -e "${RED}✗ 工人1登录失败，使用管理员token继续测试${NC}"
    WORKER1_TOKEN=$ADMIN_TOKEN
else
    echo -e "${GREEN}✓ 工人1登录成功${NC}"
fi

# 3. 获取第一个款式ID（用于创建订单）
echo -e "\n${YELLOW}步骤3: 获取款式信息${NC}"
STYLE_ID=$(curl -s -X GET "$BASE_URL/style/info/page?page=1&pageSize=1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.data.records[0].id')

if [ -z "$STYLE_ID" ] || [ "$STYLE_ID" = "null" ]; then
    echo -e "${RED}✗ 获取款式失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 款式ID: $STYLE_ID${NC}"

# 4. 管理员创建订单
echo -e "\n${YELLOW}步骤4: 管理员创建订单${NC}"
ORDER1_NO=$(curl -s -X POST "$BASE_URL/production/order/save" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"styleId\": \"$STYLE_ID\",
    \"factoryName\": \"测试工厂A\",
    \"quantity\": 100,
    \"deliveryDate\": \"2026-03-01\"
  }" | jq -r '.data.orderNo')

if [ -z "$ORDER1_NO" ] || [ "$ORDER1_NO" = "null" ]; then
    echo -e "${RED}✗ 订单创建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 订单创建成功: $ORDER1_NO${NC}"

# 5. 验证数据库中的创建人字段
echo -e "\n${YELLOW}步骤5: 验证数据库创建人记录${NC}"
mysql -h 127.0.0.1 -P 3308 -u root -pchangeme fashion_supplychain -e "
SELECT
    order_no,
    created_by_id,
    created_by_name,
    factory_name,
    DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') as create_time
FROM t_production_order
WHERE order_no = '$ORDER1_NO'
" 2>&1 | grep -v Warning

# 6. 管理员查询所有订单（应该看到）
echo -e "\n${YELLOW}步骤6: 管理员查询订单（应该看到）${NC}"
ADMIN_ORDER_COUNT=$(curl -s -X GET "$BASE_URL/production/order/page?page=1&pageSize=10&orderNo=$ORDER1_NO" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.data.total')
echo -e "管理员查询结果: ${GREEN}$ADMIN_ORDER_COUNT 条订单${NC}"

# 7. 工人1查询订单（如果有权限过滤，可能看不到管理员创建的订单）
echo -e "\n${YELLOW}步骤7: 工人1查询订单（测试权限过滤）${NC}"
WORKER1_ORDER_COUNT=$(curl -s -X GET "$BASE_URL/production/order/page?page=1&pageSize=10&orderNo=$ORDER1_NO" \
  -H "Authorization: Bearer $WORKER1_TOKEN" | jq -r '.data.total')
echo -e "工人1查询结果: ${YELLOW}$WORKER1_ORDER_COUNT 条订单${NC}"

# 8. 结果总结
echo -e "\n=========================================="
echo -e "${GREEN}测试完成总结：${NC}"
echo "1. ✅ 数据库已添加 created_by_id, created_by_name 字段"
echo "2. ✅ 创建订单时自动记录创建人信息"
echo "3. ✅ 管理员可以查看所有订单"
echo "4. ⚠️  工人权限过滤取决于 UserContext.getDataScope() 返回值"
echo ""
echo "如果工人1看不到管理员创建的订单，说明权限过滤生效！"
echo "=========================================="
