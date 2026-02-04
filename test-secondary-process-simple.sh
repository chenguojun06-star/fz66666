#!/bin/bash

# 二次工艺识别测试脚本
# 逻辑：与车缝一样，从flow快照中读取secondaryProcessStartTime等字段

echo "========================================="
echo "测试二次工艺识别功能"
echo "========================================="

# 登录获取token
echo -e "\n1. 登录获取token..."
TOKEN=$(curl -s -X POST http://localhost:8088/api/public/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | \
  python3 -c 'import sys,json; print(json.load(sys.stdin)["data"]["token"])')

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  exit 1
fi
echo "✅ 登录成功"

# 查询订单PO20260204001
echo -e "\n2. 查询订单PO20260204001..."
RESULT=$(curl -s -X POST http://localhost:8088/api/production/order/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"orderNo":"PO20260204001"}')

echo "$RESULT" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    if "data" in data and "records" in data["data"] and len(data["data"]["records"]) > 0:
        order = data["data"]["records"][0]
        print(f"\n订单号: {order.get(\"orderNo\")}")
        print(f"订单数量: {order.get(\"orderQuantity\")}")
        print(f"\n=== 车缝环节（参考） ===")
        print(f"车缝开始: {order.get(\"carSewingStartTime\", \"无\")}")
        print(f"车缝结束: {order.get(\"carSewingEndTime\", \"无\")}")
        print(f"车缝完成率: {order.get(\"carSewingCompletionRate\", \"未设置\")}%")
        print(f"\n=== 二次工艺环节 ===")
        print(f"二次工艺开始: {order.get(\"secondaryProcessStartTime\", \"无\")}")
        print(f"二次工艺结束: {order.get(\"secondaryProcessEndTime\", \"无\")}")
        print(f"二次工艺操作人: {order.get(\"secondaryProcessOperatorName\", \"无\")}")
        print(f"二次工艺完成率: {order.get(\"secondaryProcessCompletionRate\", \"未设置\")}%")
    else:
        print("❌ 未找到订单")
except Exception as e:
    print(f"❌ 解析失败: {e}")
    print(sys.stdin.read())
'

echo -e "\n========================================="
echo "测试完成"
echo "========================================="
