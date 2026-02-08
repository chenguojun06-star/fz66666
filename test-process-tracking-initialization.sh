#!/bin/bash

# 工序跟踪记录初始化测试脚本
# 用于测试老订单的工序跟踪记录初始化功能

set -e

echo "========================================="
echo "工序跟踪记录初始化测试"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 后端地址
BACKEND_URL="http://localhost:8088"

# 登录获取Token
echo "1. 登录系统..."
LOGIN_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "123456"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ 登录失败${NC}"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"
echo ""

# 测试订单
TEST_ORDER_ID="70689bde3ed0709d94473bd7a49940a1"  # PO20260205001
TEST_ORDER_NO="PO20260205001"

echo "2. 检查订单 $TEST_ORDER_NO 的裁剪菲号数据..."
BUNDLE_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  --execute="SELECT COUNT(*) as cnt FROM t_cutting_bundle WHERE production_order_id = '$TEST_ORDER_ID'" \
  2>&1 | grep -v "Warning" | tail -1)

echo -e "   菲号数量: ${YELLOW}$BUNDLE_COUNT${NC}"

if [ "$BUNDLE_COUNT" -eq 0 ]; then
  echo -e "${RED}❌ 订单没有裁剪菲号，无法初始化${NC}"
  exit 1
fi

echo ""

echo "3. 检查工序配置JSON..."
WORKFLOW_JSON=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  --execute="SELECT progress_workflow_json FROM t_production_order WHERE id = '$TEST_ORDER_ID'" \
  2>&1 | grep -v "Warning" | tail -1)

PROCESS_COUNT=$(echo $WORKFLOW_JSON | grep -o '"id":"' | wc -l | tr -d ' ')
echo -e "   工序数量: ${YELLOW}$PROCESS_COUNT${NC}"
echo ""

echo "4. 调用初始化API..."
INIT_RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/production/process-tracking/initialize/${TEST_ORDER_ID}" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN")

echo "   响应: $INIT_RESPONSE"
echo ""

# 检查响应
if echo "$INIT_RESPONSE" | grep -q '"code":200'; then
  RECORD_COUNT=$(echo $INIT_RESPONSE | grep -o '"data":[0-9]*' | cut -d':' -f2)
  echo -e "${GREEN}✅ 初始化成功！生成 $RECORD_COUNT 条跟踪记录${NC}"

  # 预期记录数 = 菲号数 × (工序数 - 1)  // 排除采购工序
  EXPECTED=$((BUNDLE_COUNT * (PROCESS_COUNT - 1)))
  echo -e "   预期记录数: ${YELLOW}$EXPECTED${NC} (菲号$BUNDLE_COUNT × 工序${PROCESS_COUNT}-1)"

  if [ "$RECORD_COUNT" -eq "$EXPECTED" ]; then
    echo -e "${GREEN}✅ 记录数正确${NC}"
  else
    echo -e "${YELLOW}⚠️  记录数不一致，请检查${NC}"
  fi
else
  echo -e "${RED}❌ 初始化失败${NC}"
  exit 1
fi

echo ""

echo "5. 查询生成的跟踪记录..."
TRACKING_RECORDS=$(curl -s -X GET "${BACKEND_URL}/api/production/process-tracking/order/${TEST_ORDER_ID}" \
  -H "Authorization: Bearer $TOKEN")

echo "   响应示例（前2条）:"
echo "$TRACKING_RECORDS" | python3 -m json.tool 2>/dev/null | head -50 || echo "$TRACKING_RECORDS"
echo ""

echo "6. 数据库验证..."
DB_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  --execute="SELECT COUNT(*) as cnt FROM t_production_process_tracking WHERE production_order_id = '$TEST_ORDER_ID'" \
  2>&1 | grep -v "Warning" | tail -1)

echo -e "   数据库记录数: ${YELLOW}$DB_COUNT${NC}"

# 查看样例数据
echo ""
echo "   样例记录:"
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  --execute="SELECT bundle_no, process_name, quantity, unit_price, scan_status
              FROM t_production_process_tracking
              WHERE production_order_id = '$TEST_ORDER_ID'
              LIMIT 3" \
  2>&1 | grep -v "Warning"

echo ""
echo "========================================="
echo -e "${GREEN}测试完成！${NC}"
echo "========================================="
echo ""
echo "📌 下一步操作:"
echo "   1. 打开前端页面: http://localhost:5173/"
echo "   2. 进入【生产管理】-【生产进度】"
echo "   3. 找到订单 $TEST_ORDER_NO"
echo "   4. 点击工序节点，查看【工序跟踪】Tab"
echo "   5. 应该能看到 $BUNDLE_COUNT 个菲号 × ${PROCESS_COUNT} 个工序的跟踪记录"
echo ""
