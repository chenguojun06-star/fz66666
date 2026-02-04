#!/bin/bash
# 测试图表API返回数据

echo "========== 获取Token =========="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:50}..."

echo -e "\n========== 测试订单裁剪图表API =========="
curl -s -X GET http://localhost:8088/api/dashboard/order-cutting-chart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool

echo -e "\n========== 测试扫菲图表API =========="
curl -s -X GET http://localhost:8088/api/dashboard/scan-count-chart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | python3 -m json.tool
