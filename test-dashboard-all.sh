#!/bin/bash
# 测试所有Dashboard API端点

echo "========== 获取Token =========="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8088/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
echo "Token exists: $([ -n "$TOKEN" ] && echo "Yes" || echo "No")"

echo -e "\n========== 测试主Dashboard API =========="
curl -s -X GET "http://localhost:8088/api/dashboard" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys, json; data=json.load(sys.stdin); print('Status:', 'SUCCESS' if data.get('code')==200 else 'FAILED')"

echo -e "\n========== 测试TopStats API =========="
curl -s -X GET "http://localhost:8088/api/dashboard/top-stats?range=week" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys, json; data=json.load(sys.stdin); print('Status:', 'SUCCESS' if data.get('code')==200 else 'FAILED'); print('Data exists:', data.get('data') is not None)"

echo -e "\n========== 测试OrderCuttingChart API (无Token) =========="
curl -s -X GET "http://localhost:8088/api/dashboard/order-cutting-chart" | python3 -c "import sys, json; data=json.load(sys.stdin); print('HTTP Status:', data.get('status', 'N/A')); print('Error:', data.get('error', 'N/A'))"

echo -e "\n========== 测试OrderCuttingChart API (有Token) =========="
curl -s -X GET "http://localhost:8088/api/dashboard/order-cutting-chart" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys, json; data=json.load(sys.stdin); print('HTTP Status:', data.get('status', 'N/A')); print('Success:', data.get('code')==200)"
