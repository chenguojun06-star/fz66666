#!/bin/bash

# 快速测试款式API

echo "=== 测试款式列表API ==="

# 登录
echo "1. 登录admin..."
LOGIN_RESP=$(curl -s -X POST "http://localhost:8088/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}')

TOKEN=$(echo "$LOGIN_RESP" | jq -r '.data.token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "✗ 登录失败"
    echo "$LOGIN_RESP" | jq '.'
    exit 1
fi

echo "✓ 登录成功"

# 查询款式 - 测试正确的API路径
echo "2. 查询款式列表..."
echo "   尝试 GET /api/style/info/list..."
STYLE_RESP=$(curl -s -X GET "http://localhost:8088/api/style/info/list?current=1&size=20" \
  -H "Authorization: Bearer $TOKEN")

TOTAL=$(echo "$STYLE_RESP" | jq -r '.data.total')
COUNT=$(echo "$STYLE_RESP" | jq -r '.data.records | length')

echo "总数: $TOTAL"
echo "返回: $COUNT 条"

if [ "$TOTAL" -gt 0 ]; then
    echo "✓ 找到款式"
    echo "$STYLE_RESP" | jq '.data.records[] | {styleNo, styleName, status}'
else
    echo "✗ 未找到款式"
    echo "完整响应:"
    echo "$STYLE_RESP" | jq '.'
fi

# 直接查询数据库
echo ""
echo "3. 数据库验证..."
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "\
SELECT style_no, style_name, status, tenant_id \
FROM t_style_info \
WHERE tenant_id=99 \
LIMIT 5;" 2>/dev/null
