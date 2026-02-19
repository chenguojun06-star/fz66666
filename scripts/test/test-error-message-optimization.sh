#!/bin/bash

# 错误提示优化验证脚本
# 测试质检/入库流程的友好提示

API_BASE="http://localhost:8088/api"
TOKEN=""

echo "=================="
echo "错误提示优化验证"
echo "=================="
echo ""

# 登录获取 token
echo "🔐 正在登录..."
LOGIN_RESPONSE=$(curl -s -X POST "$API_BASE/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "123456"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功"
echo ""

# 测试场景1：质检前未完成车缝（模拟错误）
echo "📋 测试场景1：质检前未完成车缝工序"
echo "----------------------------------------"
QUALITY_RESPONSE=$(curl -s -X POST "$API_BASE/production/scan/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "scanCode": "TEST-BUNDLE-NOT-READY",
    "processCode": "quality_receive",
    "scanQuantity": 50,
    "scanType": "quality"
  }')

echo "$QUALITY_RESPONSE" | jq -r '.message' 2>/dev/null || echo "$QUALITY_RESPONSE"
echo ""

# 测试场景2：入库前未完成包装（模拟错误）
echo "📋 测试场景2：入库前未完成包装工序"
echo "----------------------------------------"
WAREHOUSE_RESPONSE=$(curl -s -X POST "$API_BASE/production/scan/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "scanCode": "TEST-BUNDLE-NO-PACKING",
    "processCode": "warehouse_scan",
    "scanQuantity": 50,
    "scanType": "warehouse"
  }')

echo "$WAREHOUSE_RESPONSE" | jq -r '.message' 2>/dev/null || echo "$WAREHOUSE_RESPONSE"
echo ""

# 测试场景3：查询实际订单验证提示
echo "📋 测试场景3：查询已有订单"
echo "----------------------------------------"
ORDER_RESPONSE=$(curl -s -X POST "$API_BASE/production/orders/list" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "page": 1,
    "pageSize": 1
  }')

ORDER_NO=$(echo "$ORDER_RESPONSE" | jq -r '.data.records[0].orderNo' 2>/dev/null)

if [ "$ORDER_NO" != "null" ] && [ -n "$ORDER_NO" ]; then
  echo "✅ 找到订单: $ORDER_NO"

  # 查询订单的菲号
  BUNDLE_RESPONSE=$(curl -s -X GET "$API_BASE/production/cutting/list?orderNo=$ORDER_NO" \
    -H "Authorization: Bearer $TOKEN")

  BUNDLE_QR=$(echo "$BUNDLE_RESPONSE" | jq -r '.data.records[0].qrCode' 2>/dev/null)

  if [ "$BUNDLE_QR" != "null" ] && [ -n "$BUNDLE_QR" ]; then
    echo "  菲号二维码: $BUNDLE_QR"
    echo ""
    echo "💡 可以使用此菲号测试实际扫码流程，验证错误提示"
  fi
else
  echo "⚠️  未找到订单，无法测试实际流程"
fi

echo ""
echo "=================="
echo "✅ 验证完成"
echo "=================="
echo ""
echo "📌 预期错误提示特征："
echo "  ✅ 包含 '温馨提示' 前缀"
echo "  ✅ 使用 '哦~' 等友好语气"
echo "  ✅ 明确引导性操作说明"
echo ""
echo "📌 优化前后对比："
echo "  ❌ 旧：该菲号尚未完成...，不能..."
echo "  ✅ 新：温馨提示：该菲号还未完成...哦~请先..."
echo ""
