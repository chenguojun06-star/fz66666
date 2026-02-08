#!/bin/bash

# 为老订单补充工序跟踪记录
# 适用场景：已有裁剪单但没有工序跟踪记录的订单

set -e

echo "=========================================="
echo "老订单工序跟踪记录补充脚本"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
BASE_URL="http://localhost:8088"
TOKEN=""

# 登录获取 token
echo "步骤 1: 登录系统"
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "123456"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}✗ 登录失败，无法获取 Token${NC}"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ 登录成功${NC}"
echo ""

# 查询所有生产订单
echo "步骤 2: 查询所有生产订单"
ORDERS_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/production/orders/list" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "page": 1,
    "pageSize": 1000
  }')

# 提取订单ID列表
ORDER_IDS=$(echo "$ORDERS_RESPONSE" | grep -o '"id":[0-9]*' | cut -d':' -f2)
ORDER_COUNT=$(echo "$ORDER_IDS" | wc -l | xargs)

if [ -z "$ORDER_IDS" ] || [ "$ORDER_COUNT" -eq "0" ]; then
  echo -e "${YELLOW}⚠ 未找到生产订单${NC}"
  exit 0
fi

echo -e "${GREEN}✓ 找到 ${ORDER_COUNT} 个订单${NC}"
echo ""

# 为每个订单初始化工序跟踪记录
echo "步骤 3: 为订单补充工序跟踪记录"
echo ""

SUCCESS_COUNT=0
SKIP_COUNT=0
ERROR_COUNT=0

for ORDER_ID in $ORDER_IDS; do
  # 查询该订单的裁剪单数量
  BUNDLES_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/production/cutting/list?productionOrderId=${ORDER_ID}&page=1&pageSize=999" \
    -H "Authorization: Bearer ${TOKEN}")

  BUNDLE_COUNT=$(echo "$BUNDLES_RESPONSE" | grep -o '"id"' | wc -l | xargs)

  if [ "$BUNDLE_COUNT" -eq "0" ]; then
    echo -e "${YELLOW}订单 ${ORDER_ID}: 无裁剪单，跳过${NC}"
    SKIP_COUNT=$((SKIP_COUNT + 1))
    continue
  fi

  # 调用初始化接口（后端需要提供）
  # 注意：这里需要后端添加一个 API 端点来调用 initializeProcessTracking
  INIT_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/production/process-tracking/initialize/${ORDER_ID}" \
    -H "Authorization: Bearer ${TOKEN}")

  INIT_CODE=$(echo "$INIT_RESPONSE" | grep -o '"code":[0-9]*' | head -1 | cut -d':' -f2)

  if [ "$INIT_CODE" = "200" ]; then
    RECORD_COUNT=$(echo "$INIT_RESPONSE" | grep -o '"data":[0-9]*' | head -1 | cut -d':' -f2)
    echo -e "${GREEN}✓ 订单 ${ORDER_ID}: 生成 ${RECORD_COUNT} 条跟踪记录${NC}"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  else
    ERROR_MSG=$(echo "$INIT_RESPONSE" | grep -o '"message":"[^"]*' | cut -d'"' -f4)
    echo -e "${RED}✗ 订单 ${ORDER_ID}: ${ERROR_MSG}${NC}"
    ERROR_COUNT=$((ERROR_COUNT + 1))
  fi

  # 避免请求过快
  sleep 0.1
done

echo ""
echo "=========================================="
echo "迁移完成统计"
echo "=========================================="
echo ""
echo -e "总订单数: ${BLUE}${ORDER_COUNT}${NC}"
echo -e "成功: ${GREEN}${SUCCESS_COUNT}${NC}"
echo -e "跳过: ${YELLOW}${SKIP_COUNT}${NC}"
echo -e "失败: ${RED}${ERROR_COUNT}${NC}"
echo ""

if [ "$ERROR_COUNT" -gt "0" ]; then
  echo -e "${RED}部分订单初始化失败，请检查后端日志${NC}"
  exit 1
else
  echo -e "${GREEN}所有订单工序跟踪记录补充完成！${NC}"
fi
