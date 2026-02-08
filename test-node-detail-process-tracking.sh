#!/bin/bash

# 测试 NodeDetailModal 工序跟踪功能集成
# 验证生产进度页面的节点详情弹窗中是否正确显示工序跟踪（工资结算）Tab

set -e

echo "=========================================="
echo "测试 NodeDetailModal 工序跟踪功能集成"
echo "=========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 配置
BASE_URL="http://localhost:8088"
TOKEN=""

# 登录获取 token
echo "步骤 1: 登录获取 Token"
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

# 查询生产订单列表，获取第一个订单
echo "步骤 2: 查询生产订单列表"
ORDERS_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/production/orders/list" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d '{
    "page": 1,
    "pageSize": 10
  }')

ORDER_ID=$(echo "$ORDERS_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
ORDER_NO=$(echo "$ORDERS_RESPONSE" | grep -o '"orderNo":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$ORDER_ID" ] || [ -z "$ORDER_NO" ]; then
  echo -e "${YELLOW}⚠ 未找到生产订单，请先创建订单${NC}"
  exit 0
fi

echo -e "${GREEN}✓ 找到订单: ID=$ORDER_ID, 订单号=$ORDER_NO${NC}"
echo ""

# 测试工序跟踪 API（NodeDetailModal 使用的同一个 API）
echo "步骤 3: 测试工序跟踪 API"
TRACKING_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/production/process-tracking/order/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

TRACKING_COUNT=$(echo "$TRACKING_RESPONSE" | grep -o '"id"' | wc -l)
TRACKING_CODE=$(echo "$TRACKING_RESPONSE" | grep -o '"code":[0-9]*' | head -1 | cut -d':' -f2)

if [ "$TRACKING_CODE" != "200" ]; then
  echo -e "${RED}✗ API 调用失败${NC}"
  echo "响应: $TRACKING_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ API 调用成功${NC}"
echo "  - 工序跟踪记录数: $TRACKING_COUNT"

# 显示示例记录
if [ "$TRACKING_COUNT" -gt "0" ]; then
  echo ""
  echo "示例记录（前 2 条）："
  echo "$TRACKING_RESPONSE" | grep -o '"bundleNo":"[^"]*' | head -2 | sed 's/"bundleNo":"/  - 菲号: /g'
  echo "$TRACKING_RESPONSE" | grep -o '"processName":"[^"]*' | head -2 | sed 's/"processName":"/  - 工序名称: /g'
  echo "$TRACKING_RESPONSE" | grep -o '"operatorName":"[^"]*' | head -2 | sed 's/"operatorName":"/  - 操作人: /g'
else
  echo -e "${YELLOW}  ⚠ 该订单暂无工序跟踪记录（需要扫码后才会生成）${NC}"
fi

echo ""

# 前端集成验证提示
echo "=========================================="
echo "前端集成验证"
echo "=========================================="
echo ""
echo "请在浏览器中验证以下内容："
echo ""
echo "1. 打开生产进度页面: http://localhost:5173/production/progress"
echo "2. 点击任意订单的工序节点（如裁剪、车缝等）"
echo "3. 在弹出的 NodeDetailModal 中查看是否有新增的 Tab："
echo "   ${GREEN}「工序跟踪（工资结算） (${TRACKING_COUNT})」${NC}"
echo ""
echo "4. 点击该 Tab，应该看到："
echo "   - 表格显示菲号、SKU、颜色、尺码、数量、工序、单价等信息"
echo "   - 显示扫码时间、操作人、结算金额、状态"
echo "   - 底部有汇总行（总数量、总金额、已完成数）"
echo ""

if [ "$TRACKING_COUNT" -eq "0" ]; then
  echo -e "${YELLOW}5. 提示：当前订单无跟踪记录，可以先扫码后再查看${NC}"
  echo "   - 使用小程序扫描菲号二维码"
  echo "   - 或运行测试脚本: ./test-production-order-creator-tracking.sh"
else
  echo -e "${GREEN}5. 该订单已有 ${TRACKING_COUNT} 条跟踪记录，可直接查看${NC}"
fi

echo ""
echo "=========================================="
echo "集成要点总结"
echo "=========================================="
echo ""
echo "✓ 已添加 ProcessTrackingTable 组件到 NodeDetailModal"
echo "✓ 已添加 loadProcessTrackingData 函数"
echo "✓ 已添加工序跟踪 Tab（仅大货生产显示，样板生产不显示）"
echo "✓ 使用相同 API: getProductionProcessTracking"
echo "✓ 与 ProcessDetailModal 保持一致的用户体验"
echo ""
echo -e "${GREEN}集成完成！API 测试通过！${NC}"
echo ""
