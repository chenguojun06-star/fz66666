#!/bin/bash

# 延期订单API测试脚本
echo "========================================="
echo "测试延期订单API"
echo "========================================="

# 登录获取token
echo -e "\n1. 登录..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8088/api/public/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | python3 -c 'import sys,json; data=json.load(sys.stdin); print(data.get("data", {}).get("token", ""))' 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
fi
echo "✅ 登录成功"

# 查询延期订单
echo -e "\n2. 查询延期订单..."
RESULT=$(curl -s -X GET http://localhost:8088/api/dashboard/overdue-orders \
  -H "Authorization: Bearer $TOKEN")

echo "$RESULT" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get("code") == 200:
        orders = data.get("data", [])
        print(f"✅ API调用成功，共查询到 {len(orders)} 条延期订单\n")

        if len(orders) > 0:
            print("延期订单列表（前5条）:")
            print("-" * 80)
            print(f"{'订单号':<20} {'款号':<15} {'数量':<10} {'交货日期':<15} {'延期天数':<10}")
            print("-" * 80)
            for i, order in enumerate(orders[:5]):
                print(f"{order.get('orderNo', 'N/A'):<20} "
                      f"{order.get('styleNo', 'N/A'):<15} "
                      f"{order.get('quantity', 0):<10} "
                      f"{order.get('deliveryDate', 'N/A'):<15} "
                      f"{order.get('overdueDays', 0):<10}")
            if len(orders) > 5:
                print(f"... 还有 {len(orders) - 5} 条记录")
        else:
            print("✅ 当前没有延期订单")
    else:
        print(f"❌ API返回错误: {data.get('message', '未知错误')}")
except Exception as e:
    print(f"❌ 解析失败: {e}")
    print(sys.stdin.read())
'

echo -e "\n========================================="
echo "测试完成"
echo "========================================="
