#!/bin/bash

# 初始化工序跟踪记录测试脚本

echo "🔧 工序跟踪记录初始化"
echo "===================="

# 登录获取token
echo "1️⃣ 登录系统..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8088/api/system/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c "import sys, json; resp=json.load(sys.stdin); print(resp.get('data', {}).get('token', ''))" 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ 登录成功"

# 查询所有PO订单
echo ""
echo "2️⃣ 查询生产订单..."
ORDERS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  -e "SELECT id, order_no FROM t_production_order WHERE order_no LIKE 'PO%' ORDER BY create_time DESC LIMIT 10;" \
  2>/dev/null | tail -n +2)

if [ -z "$ORDERS" ]; then
  echo "❌ 没有找到订单"
  exit 1
fi

echo "✅ 找到订单："
echo "$ORDERS"

# 初始化每个订单的工序跟踪
echo ""
echo "3️⃣ 初始化工序跟踪记录..."
COUNT=0
TOTAL=0

while IFS=$'\t' read -r ORDER_ID ORDER_NO; do
  if [ -n "$ORDER_ID" ]; then
    echo ""
    echo "处理订单: $ORDER_NO ($ORDER_ID)"

    RESULT=$(curl -s -X POST "http://localhost:8088/api/production/process-tracking/initialize/$ORDER_ID" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json")

    CODE=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('code', 500))" 2>/dev/null)

    if [ "$CODE" = "200" ]; then
      RECORDS=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('data', 0))" 2>/dev/null)
      echo "  ✅ 成功生成 $RECORDS 条跟踪记录"
      COUNT=$((COUNT+1))
      TOTAL=$((TOTAL+RECORDS))
    else
      MSG=$(echo "$RESULT" | python3 -c "import sys, json; print(json.load(sys.stdin).get('message', '未知错误'))" 2>/dev/null)
      echo "  ⚠️  失败: $MSG"
    fi

    sleep 1
  fi
done <<< "$ORDERS"

echo ""
echo "===================="
echo "📊 初始化完成："
echo "   成功订单: $COUNT"
echo "   生成记录: $TOTAL 条"

# 验证数据库
echo ""
echo "4️⃣ 验证数据库..."
DB_COUNT=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain \
  -e "SELECT COUNT(*) FROM t_production_process_tracking;" 2>/dev/null | tail -1)

echo "✅ 数据库中现有 $DB_COUNT 条跟踪记录"
