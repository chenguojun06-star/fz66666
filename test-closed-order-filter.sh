#!/bin/bash

# ========================================
# 测试已关闭订单过滤修复
# 日期: 2026-02-06
# ========================================

BASE_URL="http://localhost:8088"
TOKEN="${JWT_TOKEN:-}"

echo "======================================"
echo "测试：已关闭订单过滤修复"
echo "======================================"
echo

# 如果没有提供Token，尝试登录获取
if [ -z "$TOKEN" ]; then
  echo "未提供JWT_TOKEN，尝试登录..."
  LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
      "username": "admin",
      "password": "admin123"
    }')

  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$TOKEN" ]; then
    echo "❌ 登录失败"
    echo "响应: $LOGIN_RESPONSE"
    exit 1
  fi
  echo "✅ 登录成功"
  echo
fi

echo "======================================"
echo "测试1: 裁剪任务列表（排除已关闭订单）"
echo "======================================"

CUTTING_TASKS=$(curl -s -X GET "$BASE_URL/api/production/cutting-task/list?myTasks=true" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "响应: $CUTTING_TASKS"
echo

# 检查响应中的订单状态
CLOSED_COUNT=$(echo "$CUTTING_TASKS" | grep -o '"status":"closed"' | wc -l)
COMPLETED_COUNT=$(echo "$CUTTING_TASKS" | grep -o '"status":"completed"' | wc -l)

if [ "$CLOSED_COUNT" -eq 0 ] && [ "$COMPLETED_COUNT" -eq 0 ]; then
  echo "✅ 测试1通过：裁剪任务列表未包含已关闭/已完成订单"
else
  echo "❌ 测试1失败：发现 $CLOSED_COUNT 个已关闭订单，$COMPLETED_COUNT 个已完成订单"
fi
echo

echo "======================================"
echo "测试2: 采购任务列表（排除已关闭订单）"
echo "======================================"

PURCHASE_TASKS=$(curl -s -X GET "$BASE_URL/api/production/purchase/list?myTasks=true" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "响应: $PURCHASE_TASKS"
echo

CLOSED_COUNT=$(echo "$PURCHASE_TASKS" | grep -o '"status":"closed"' | wc -l)
COMPLETED_COUNT=$(echo "$PURCHASE_TASKS" | grep -o '"status":"completed"' | wc -l)

if [ "$CLOSED_COUNT" -eq 0 ] && [ "$COMPLETED_COUNT" -eq 0 ]; then
  echo "✅ 测试2通过：采购任务列表未包含已关闭/已完成订单"
else
  echo "❌ 测试2失败：发现 $CLOSED_COUNT 个已关闭订单，$COMPLETED_COUNT 个已完成订单"
fi
echo

echo "======================================"
echo "测试3: 质检任务列表（排除已关闭订单）"
echo "======================================"

QUALITY_TASKS=$(curl -s -X GET "$BASE_URL/api/production/scan/my-quality-tasks" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "响应: $QUALITY_TASKS"
echo

CLOSED_COUNT=$(echo "$QUALITY_TASKS" | grep -o '"status":"closed"' | wc -l)
COMPLETED_COUNT=$(echo "$QUALITY_TASKS" | grep -o '"status":"completed"' | wc -l)

if [ "$CLOSED_COUNT" -eq 0 ] && [ "$COMPLETED_COUNT" -eq 0 ]; then
  echo "✅ 测试3通过：质检任务列表未包含已关闭/已完成订单"
else
  echo "❌ 测试3失败：发现 $CLOSED_COUNT 个已关闭订单，$COMPLETED_COUNT 个已完成订单"
fi
echo

echo "======================================"
echo "测试4: 入库数量验证（50/200 = 25%）"
echo "======================================"
echo "注意：此测试需要真实的订单数据"
echo "新规则：允许5%~50%的入库比例"
echo "======================================"
echo

echo "完成所有测试"
echo "======================================"
