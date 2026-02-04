#!/bin/bash

# 测试延期订单接口是否返回工厂名称
# 作者: AI助手
# 日期: 2026-02-04

echo "🧪 测试延期订单工厂列功能"
echo "================================"
echo ""

# 获取登录token
echo "📝 步骤1: 获取登录token..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功，token: ${TOKEN:0:20}..."
echo ""

# 调用延期订单接口
echo "📝 步骤2: 调用延期订单接口..."
RESPONSE=$(curl -s -X GET http://localhost:8088/api/dashboard/overdue-orders \
  -H "Authorization: Bearer $TOKEN")

echo "响应数据:"
echo $RESPONSE | jq '.'
echo ""

# 检查是否包含factoryName字段
echo "📝 步骤3: 检查factoryName字段..."
HAS_FACTORY=$(echo $RESPONSE | jq '.data[0].factoryName')

if [ "$HAS_FACTORY" = "null" ]; then
  echo "⚠️  警告: 第一条数据没有factoryName字段"
else
  echo "✅ factoryName字段存在: $HAS_FACTORY"
fi

echo ""
echo "📊 延期订单列表 (前3条):"
echo $RESPONSE | jq '.data[0:3] | .[] | {orderNo, styleNo, factoryName, overdueDays}'

echo ""
echo "================================"
echo "✅ 测试完成"
