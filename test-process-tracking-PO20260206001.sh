#!/bin/bash
# 测试订单 PO20260206001 的工序跟踪记录

set -e

API_BASE_URL="http://localhost:8088/api"
ORDER_NO="PO20260206001"

echo "======================================"
echo "检查订单 ${ORDER_NO} 的工序跟踪记录"
echo "======================================"

# 1. 查询订单详情
echo -e "\n1️⃣ 查询订单详情..."
ORDER_RESPONSE=$(curl -s "${API_BASE_URL}/production/order/list" \
  -H "Content-Type: application/json" \
  -d "{\"orderNo\": \"${ORDER_NO}\"}")

echo "$ORDER_RESPONSE" | jq '.'

ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.data.records[0].id // empty')

if [ -z "$ORDER_ID" ]; then
  echo "❌ 订单不存在：${ORDER_NO}"
  exit 1
fi

echo "✅ 订单ID: ${ORDER_ID}"

# 2. 查询裁剪单（菲号）
echo -e "\n2️⃣ 查询裁剪单..."
CUTTING_RESPONSE=$(curl -s "${API_BASE_URL}/production/cutting/list?productionOrderId=${ORDER_ID}&pageSize=999")

echo "$CUTTING_RESPONSE" | jq '.'

BUNDLE_COUNT=$(echo "$CUTTING_RESPONSE" | jq '.data.records | length')
echo "✅ 菲号数量: ${BUNDLE_COUNT}"

if [ "$BUNDLE_COUNT" -eq 0 ]; then
  echo "⚠️ 该订单还没有生成裁剪单（菲号），需要先在裁剪管理中生成菲号"
  echo ""
  echo "操作步骤："
  echo "1. 进入「生产管理」→「裁剪管理」"
  echo "2. 找到订单 ${ORDER_NO} 点击「领取」"
  echo "3. 填写每个颜色尺码的数量，生成菲号"
  echo "4. 生成后会自动触发工序跟踪记录初始化"
  exit 0
fi

# 显示菲号列表
echo -e "\n菲号列表:"
echo "$CUTTING_RESPONSE" | jq -r '.data.records[] | "  菲号 \(.bundleNo): \(.color) / \(.size) / \(.quantity)件"'

# 3. 查询工序跟踪记录
echo -e "\n3️⃣ 查询工序跟踪记录..."
TRACKING_RESPONSE=$(curl -s "${API_BASE_URL}/production/process-tracking/order/${ORDER_ID}")

echo "$TRACKING_RESPONSE" | jq '.'

TRACKING_COUNT=$(echo "$TRACKING_RESPONSE" | jq '.data | length')
echo "✅ 工序跟踪记录数量: ${TRACKING_COUNT}"

if [ "$TRACKING_COUNT" -eq 0 ]; then
  echo "⚠️ 工序跟踪记录为空，需要手动初始化"
  echo ""
  echo "执行初始化命令:"
  echo "curl -X POST \"${API_BASE_URL}/production/process-tracking/initialize/${ORDER_ID}\""

  # 自动执行初始化
  echo -e "\n正在自动初始化..."
  INIT_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/production/process-tracking/initialize/${ORDER_ID}")
  echo "$INIT_RESPONSE" | jq '.'

  NEW_COUNT=$(echo "$INIT_RESPONSE" | jq '.data')
  echo "✅ 成功生成 ${NEW_COUNT} 条工序跟踪记录"

  # 重新查询
  echo -e "\n重新查询工序跟踪记录..."
  TRACKING_RESPONSE=$(curl -s "${API_BASE_URL}/production/process-tracking/order/${ORDER_ID}")
  TRACKING_COUNT=$(echo "$TRACKING_RESPONSE" | jq '.data | length')
fi

# 4. 按菲号分组显示
echo -e "\n4️⃣ 工序跟踪记录详情（按菲号分组）:"
echo "$TRACKING_RESPONSE" | jq -r '
.data
| group_by(.bundleNo)
| .[]
| "
菲号 \(.[0].bundleNo) - \(.[0].color) / \(.[0].size) (\(.[0].quantity)件):
\(. | map("  • \(.processName) (\(.processCode)) - 状态: \(.scanStatus) - 单价: ¥\(.unitPrice // 0)") | join("\n"))"
'

# 5. 统计分析
echo -e "\n5️⃣ 统计分析:"
PROCESS_COUNT=$(echo "$TRACKING_RESPONSE" | jq '[.data | group_by(.processCode) | length] | .[0]')
echo "  • 菲号数量: ${BUNDLE_COUNT}"
echo "  • 工序数量: ${PROCESS_COUNT}"
echo "  • 预期记录数: $((BUNDLE_COUNT * PROCESS_COUNT))"
echo "  • 实际记录数: ${TRACKING_COUNT}"

if [ "$TRACKING_COUNT" -eq $((BUNDLE_COUNT * PROCESS_COUNT)) ]; then
  echo "  ✅ 记录完整：每个菲号的每个工序都有独立记录"
else
  echo "  ⚠️ 记录不完整，可能需要重新初始化"
fi

echo -e "\n======================================"
echo "测试完成！"
echo "======================================"
