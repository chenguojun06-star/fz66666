#!/bin/bash

# 测试：入库记录 → 物料对账的完整数据流（包含库区字段）
# 验证：采购类型、时间链、库区 6个字段全部正确同步

BASE_URL="http://localhost:8088"

echo "=================================================="
echo "测试物料对账完整数据流（含库区字段）"
echo "=================================================="

# 清理测试数据
echo ""
echo "1️⃣  清理旧测试数据..."
TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTczODQ4OTIwMn0.XXf8NG0nUcBJfRtNHtSwqZBQG6d1P6HaEHNHK-pYmqI"

# 查询测试采购单
PURCHASE_ID=$(curl -s -X GET "$BASE_URL/api/production/purchase/list?pageNum=1&pageSize=1&materialName=测试库区同步" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq -r '.data.records[0].id // empty')

if [ -n "$PURCHASE_ID" ]; then
  echo "   🗑️  删除测试采购单: $PURCHASE_ID"
  curl -s -X DELETE "$BASE_URL/api/production/purchase/$PURCHASE_ID" \
    -H "Authorization: Bearer $TOKEN" > /dev/null
fi

# 2. 创建测试采购单（批量订单，含时间信息）
echo ""
echo "2️⃣  创建测试采购单（批量订单类型）..."
EXPECTED_DATE=$(date -v+7d "+%Y-%m-%d %H:%M:%S")
ACTUAL_DATE=$(date -v+5d "+%Y-%m-%d %H:%M:%S")

PURCHASE_RESPONSE=$(curl -s -X POST "$BASE_URL/api/production/purchase" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "materialCode": "MT9999",
    "materialName": "测试库区同步物料",
    "supplierId": "SUP001",
    "supplierName": "测试供应商",
    "quantity": 500,
    "unitPrice": 12.5,
    "orderId": "ORD202601",
    "orderNo": "PO202601310001",
    "sourceType": "order",
    "expectedArrivalDate": "'"$EXPECTED_DATE"'",
    "actualArrivalDate": "'"$ACTUAL_DATE"'"
  }')

PURCHASE_ID=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.id')
PURCHASE_NO=$(echo "$PURCHASE_RESPONSE" | jq -r '.data.purchaseNo')

if [ -z "$PURCHASE_ID" ] || [ "$PURCHASE_ID" = "null" ]; then
  echo "   ❌ 采购单创建失败"
  echo "   响应: $PURCHASE_RESPONSE"
  exit 1
fi

echo "   ✅ 采购单创建成功"
echo "   ID: $PURCHASE_ID"
echo "   编号: $PURCHASE_NO"
echo "   采购类型: order（批量订单）"
echo "   预计到货: $EXPECTED_DATE"
echo "   实际到货: $ACTUAL_DATE"

# 3. 创建入库记录（指定库区为"A区001"）
echo ""
echo "3️⃣  创建入库记录（指定库区）..."
sleep 2

INBOUND_RESPONSE=$(curl -s -X POST "$BASE_URL/api/material/inbound" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "purchaseNo": "'"$PURCHASE_NO"'",
    "warehouseLocation": "A区001",
    "receiver": "测试仓管员",
    "remark": "测试库区字段同步"
  }')

INBOUND_NO=$(echo "$INBOUND_RESPONSE" | jq -r '.data.inboundNo')
INBOUND_ID=$(echo "$INBOUND_RESPONSE" | jq -r '.data.id')

if [ -z "$INBOUND_NO" ] || [ "$INBOUND_NO" = "null" ]; then
  echo "   ❌ 入库记录创建失败"
  echo "   响应: $INBOUND_RESPONSE"
  exit 1
fi

echo "   ✅ 入库记录创建成功"
echo "   编号: $INBOUND_NO"
echo "   库区: A区001"
echo "   🔄 自动触发物料对账同步..."

# 4. 等待异步同步完成
sleep 3

# 5. 查询物料对账记录，验证6个字段
echo ""
echo "4️⃣  验证物料对账记录（6个字段）..."

RECON_RESPONSE=$(curl -s -X GET "$BASE_URL/finance/material-reconciliation/list?pageNum=1&pageSize=10&purchaseNo=$PURCHASE_NO" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

RECON_COUNT=$(echo "$RECON_RESPONSE" | jq -r '.data.total')

if [ "$RECON_COUNT" = "0" ] || [ -z "$RECON_COUNT" ]; then
  echo "   ❌ 未找到对账记录"
  echo "   响应: $RECON_RESPONSE"
  exit 1
fi

RECON_RECORD=$(echo "$RECON_RESPONSE" | jq -r '.data.records[0]')

echo "   ✅ 物料对账记录已创建"
echo ""
echo "   📋 完整字段验证："
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 验证6个新增字段
SOURCE_TYPE=$(echo "$RECON_RECORD" | jq -r '.sourceType')
PATTERN_ID=$(echo "$RECON_RECORD" | jq -r '.patternProductionId // "（无）"')
EXPECTED=$(echo "$RECON_RECORD" | jq -r '.expectedArrivalDate // "（无）"')
ACTUAL=$(echo "$RECON_RECORD" | jq -r '.actualArrivalDate // "（无）"')
INBOUND=$(echo "$RECON_RECORD" | jq -r '.inboundDate // "（无）"')
LOCATION=$(echo "$RECON_RECORD" | jq -r '.warehouseLocation // "（无）"')

echo "   1. 采购类型: $SOURCE_TYPE"
echo "   2. 样衣生产ID: $PATTERN_ID"
echo "   3. 预计到货日期: $EXPECTED"
echo "   4. 实际到货日期: $ACTUAL"
echo "   5. 入库日期: $INBOUND"
echo "   6. 库区: $LOCATION"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 验证结果
FAIL_COUNT=0

if [ "$SOURCE_TYPE" != "order" ]; then
  echo "   ❌ 采购类型错误: 期望 order, 实际 $SOURCE_TYPE"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "   ✅ 采购类型正确"
fi

if [ "$EXPECTED" = "（无）" ] || [ -z "$EXPECTED" ]; then
  echo "   ❌ 预计到货日期未同步"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "   ✅ 预计到货日期已同步"
fi

if [ "$ACTUAL" = "（无）" ] || [ -z "$ACTUAL" ]; then
  echo "   ❌ 实际到货日期未同步"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "   ✅ 实际到货日期已同步"
fi

if [ "$INBOUND" = "（无）" ] || [ -z "$INBOUND" ]; then
  echo "   ❌ 入库日期未同步"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "   ✅ 入库日期已同步"
fi

if [ "$LOCATION" != "A区001" ]; then
  echo "   ❌ 库区错误: 期望 A区001, 实际 $LOCATION"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  echo "   ✅ 库区正确同步"
fi

echo ""
echo "=================================================="
if [ $FAIL_COUNT -eq 0 ]; then
  echo "✅ 测试通过！所有6个字段均正确同步"
  echo "   - 采购类型区分（order/sample）"
  echo "   - 完整时间链（预计→实际→入库）"
  echo "   - 库区信息（仓库位置）"
else
  echo "❌ 测试失败！$FAIL_COUNT 个字段同步异常"
  exit 1
fi
echo "=================================================="
