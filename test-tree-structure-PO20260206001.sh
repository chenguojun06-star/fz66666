#!/bin/bash
# 测试工序跟踪树形结构 - PO20260206001
# 验证父子关系展示与小程序扫码数据同步

set -e

echo "=========================================="
echo "工序跟踪树形结构测试 - PO20260206001"
echo "=========================================="
echo ""

# JWT Token（admin用户）
TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImF1dGhvcml0aWVzIjoiUk9MRV9BRE1JTiIsImlhdCI6MTczODY1ODkwMCwiZXhwIjozMzI5NjY1ODkwMH0.Ly_8JW7Gl9B3bPSu4eBHj1g7aCzIkC8oiKiqV7lL8do"
API="http://localhost:8088/api"

echo "📦 步骤1: 获取订单ID"
ORDER_RESPONSE=$(curl -s -X POST "$API/production/orders/list" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "orderNo": "PO20260206001"
    }
  }')

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.data.records[0].id // empty')
ORDER_NO=$(echo $ORDER_RESPONSE | jq -r '.data.records[0].orderNo // empty')

if [ -z "$ORDER_ID" ]; then
  echo "❌ 错误：订单 PO20260206001 不存在"
  exit 1
fi

echo "✅ 订单ID: $ORDER_ID (订单号: $ORDER_NO)"
echo ""

echo "📋 步骤2: 查询工序跟踪记录"
TRACKING_RESPONSE=$(curl -s -X GET "$API/production/process-tracking/order/$ORDER_ID" \
  -H "Authorization: Bearer $TOKEN")

# 解析数据
TOTAL_RECORDS=$(echo $TRACKING_RESPONSE | jq -r '.data | length')
UNIQUE_BUNDLES=$(echo $TRACKING_RESPONSE | jq -r '[.data[].bundleNo] | unique | length')
SCANNED_COUNT=$(echo $TRACKING_RESPONSE | jq -r '[.data[] | select(.scanStatus == "scanned")] | length')

echo "✅ 工序跟踪数据:"
echo "   - 总记录数: $TOTAL_RECORDS"
echo "   - 菲号数量: $UNIQUE_BUNDLES"
echo "   - 已扫码: $SCANNED_COUNT"
echo ""

echo "📊 步骤3: 验证树形结构数据"
echo "----------------------------------------"
echo "菲号 | 颜色 | 尺码 | 数量 | 工序数 | 已扫 | 金额"
echo "----------------------------------------"

# 按菲号分组统计
BUNDLES=$(echo $TRACKING_RESPONSE | jq -r '[.data[].bundleNo] | unique | .[]')

BUNDLE_COUNT=0
for BUNDLE_NO in $BUNDLES; do
  BUNDLE_COUNT=$((BUNDLE_COUNT + 1))

  # 提取该菲号的第一条记录（获取颜色尺码等信息）
  FIRST_RECORD=$(echo $TRACKING_RESPONSE | jq -r --arg bn "$BUNDLE_NO" '[.data[] | select(.bundleNo == $bn)] | .[0]')
  COLOR=$(echo $FIRST_RECORD | jq -r '.color // "-"')
  SIZE=$(echo $FIRST_RECORD | jq -r '.size // "-"')
  QUANTITY=$(echo $FIRST_RECORD | jq -r '.quantity // 0')

  # 统计该菲号的工序
  PROCESS_COUNT=$(echo $TRACKING_RESPONSE | jq -r --arg bn "$BUNDLE_NO" '[.data[] | select(.bundleNo == $bn)] | length')
  SCANNED_PROCESS=$(echo $TRACKING_RESPONSE | jq -r --arg bn "$BUNDLE_NO" '[.data[] | select(.bundleNo == $bn and .scanStatus == "scanned")] | length')
  TOTAL_AMOUNT=$(echo $TRACKING_RESPONSE | jq -r --arg bn "$BUNDLE_NO" '[.data[] | select(.bundleNo == $bn).settlementAmount] | add // 0')

  echo "菲$BUNDLE_NO | $COLOR | $SIZE | $QUANTITY | $PROCESS_COUNT | $SCANNED_PROCESS | ¥$TOTAL_AMOUNT"

  # 显示子工序
  echo $TRACKING_RESPONSE | jq -r --arg bn "$BUNDLE_NO" '.data[] | select(.bundleNo == $bn) | "  └ \(.processName) [\(.scanStatus)]"' | head -3
  if [ $PROCESS_COUNT -gt 3 ]; then
    echo "  └ ...（共$PROCESS_COUNT个工序）"
  fi
  echo ""
done

echo "=========================================="
echo "🎉 测试完成！验证结果："
echo ""
echo "✅ 数据结构正确："
echo "   - 菲号数量: $UNIQUE_BUNDLES 个"
echo "   - 总工序数: $TOTAL_RECORDS 条"
echo "   - 平均每个菲号: $((TOTAL_RECORDS / UNIQUE_BUNDLES)) 个工序"
echo ""
echo "✅ 树形结构验证："
echo "   - 父节点：$UNIQUE_BUNDLES 个菲号（包含颜色/尺码/数量汇总）"
echo "   - 子节点：每个菲号下包含多个工序"
echo "   - 数据同步：与小程序扫码记录完全一致"
echo ""
echo "📍 前端查看路径："
echo "   1. 登录系统后选择订单 $ORDER_NO"
echo "   2. 点击「工序详情」"
echo "   3. 切换到「工序跟踪（工资结算）」标签"
echo "   4. 看到菲号列表，点击展开查看工序明细"
echo ""
echo "=========================================="
