#!/bin/bash
# 使用正确的登录端点测试图表API

echo "========== 获取Token =========="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8088/api/system/user/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('data', {}).get('token', ''))")
echo "Token: ${TOKEN:0:50}..."

echo -e "\n========== 测试订单裁剪图表API =========="
CHART_RESPONSE=$(curl -s -X GET http://localhost:8088/api/dashboard/order-cutting-chart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$CHART_RESPONSE" | python3 <<EOF
import json, sys
try:
    data = json.load(sys.stdin)
    if data.get('code') == 200:
        chart_data = data.get('data', {})
        dates = chart_data.get('dates', [])
        orders = chart_data.get('orderQuantities', [])
        cuttings = chart_data.get('cuttingQuantities', [])

        print(f"✅ API调用成功!")
        print(f"📅 日期数量: {len(dates)}")
        print(f"📦 订单数据数量: {len(orders)}")
        print(f"✂️  裁剪数据数量: {len(cuttings)}")

        if len(dates) > 0:
            print(f"\n前5天日期: {dates[:5]}")
            print(f"前5天订单数量: {orders[:5]}")
            print(f"前5天裁剪数量: {cuttings[:5]}")

            total_orders = sum(orders)
            total_cuttings = sum(cuttings)
            print(f"\n📊 统计:")
            print(f"- 30天订单总量: {total_orders}")
            print(f"- 30天裁剪总量: {total_cuttings}")
    else:
        print(f"❌ API返回错误: {data}")
except Exception as e:
    print(f"❌ 解析错误: {e}")
    print(f"原始响应: {sys.stdin.read()}")
EOF

echo -e "\n========== 测试扫菲图表API =========="
SCAN_RESPONSE=$(curl -s -X GET http://localhost:8088/api/dashboard/scan-count-chart \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$SCAN_RESPONSE" | python3 <<EOF
import json, sys
try:
    data = json.load(sys.stdin)
    if data.get('code') == 200:
        chart_data = data.get('data', {})
        dates = chart_data.get('dates', [])
        counts = chart_data.get('scanCounts', [])
        quantities = chart_data.get('scanQuantities', [])

        print(f"✅ API调用成功!")
        print(f"📅 日期数量: {len(dates)}")
        print(f"🔢 扫菲次数数据: {len(counts)}")
        print(f"📦 扫菲数量数据: {len(quantities)}")

        if len(dates) > 0:
            print(f"\n前5天数据: {dates[:5]}")
            print(f"前5天扫菲次数: {counts[:5]}")
            print(f"前5天扫菲数量: {quantities[:5]}")
    else:
        print(f"❌ API返回错误: {data}")
except Exception as e:
    print(f"❌ 解析错误: {e}")
EOF
