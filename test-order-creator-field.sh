#!/bin/bash

echo "==========================================="
echo "测试：验证样式列表中的最近下单人字段"
echo "==========================================="
echo ""

# 等待服务启动
echo "等待后端服务启动..."
for i in {1..30}; do
  if curl -s http://localhost:8088/actuator/health > /dev/null 2>&1; then
    echo "✅ 后端服务已就绪"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ 后端服务启动超时"
    exit 1
  fi
  sleep 1
done

echo ""
echo "步骤1：获取样式列表（onlyCompleted=true）"
echo "-------------------------------------------"
RESPONSE=$(curl -s -X GET "http://localhost:8088/api/style/info/list?onlyCompleted=true&page=1&pageSize=5" \
  -H "Authorization: Bearer test" \
  -H "Content-Type: application/json")

echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"

echo ""
echo "步骤2：提取并显示latestOrderTime和latestOrderCreator字段"
echo "-------------------------------------------"
RECORDS=$(echo "$RESPONSE" | jq -r '.data.records[]? | "\(.styleNo // "N/A") - 最近下单时间: \(.latestOrderTime // "无") - 下单人: \(.latestOrderCreator // "无")"' 2>/dev/null)

if [ -z "$RECORDS" ]; then
  echo "⚠️  没有找到完成的样式，或字段未正确返回"
else
  echo "$RECORDS"
fi

echo ""
echo "==========================================="
echo "测试完成"
echo "==========================================="
