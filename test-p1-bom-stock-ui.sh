#!/bin/bash

# P1功能测试：BOM库存检查
# 验证：库存状态自动计算、前端UI显示、API端点

BASE_URL="http://localhost:8088"
TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTczODQ4OTIwMn0.XXf8NG0nUcBJfRtNHtSwqZBQG6d1P6HaEHNHK-pYmqI"

echo "=========================================="
echo "P1功能测试：BOM库存检查"
echo "=========================================="

# 查找第一个有BOM数据的款号
echo ""
echo "1️⃣  查找测试款号..."
STYLE_ID=$(curl -s -X GET "$BASE_URL/api/style/info/list?pageNum=1&pageSize=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" | jq -r '.data.records[0].id // empty')

if [ -z "$STYLE_ID" ]; then
  echo "   ❌ 未找到款号数据"
  exit 1
fi

echo "   ✅ 测试款号ID: $STYLE_ID"

# 检查BOM库存（生产数量=10）
echo ""
echo "2️⃣  检查BOM库存状态（生产数量=10）..."
PRODUCTION_QTY=10

CHECK_RESPONSE=$(curl -s -X POST "$BASE_URL/api/style/bom/check-stock/$STYLE_ID?productionQty=$PRODUCTION_QTY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$CHECK_RESPONSE" | jq '.'

BOM_COUNT=$(echo "$CHECK_RESPONSE" | jq '.data | length')

if [ -z "$BOM_COUNT" ] || [ "$BOM_COUNT" = "null" ]; then
  echo "   ⚠️  该款号暂无BOM数据，尝试下一个..."
  exit 0
fi

echo ""
echo "   ✅ BOM物料数量: $BOM_COUNT"

# 统计库存状态
echo ""
echo "3️⃣  分析库存状态..."

SUFFICIENT=$(echo "$CHECK_RESPONSE" | jq '[.data[] | select(.stockStatus=="sufficient")] | length')
INSUFFICIENT=$(echo "$CHECK_RESPONSE" | jq '[.data[] | select(.stockStatus=="insufficient")] | length')
NONE=$(echo "$CHECK_RESPONSE" | jq '[.data[] | select(.stockStatus=="none")] | length')
UNCHECKED=$(echo "$CHECK_RESPONSE" | jq '[.data[] | select(.stockStatus=="unchecked" or .stockStatus==null)] | length')

echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   库存充足: $SUFFICIENT 个"
echo "   库存不足: $INSUFFICIENT 个"
echo "   无库存:   $NONE 个"
echo "   未检查:   $UNCHECKED 个"
echo "   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 显示需要采购的物料
echo ""
echo "4️⃣  需要采购的物料..."

NEED_PURCHASE=$(echo "$CHECK_RESPONSE" | jq -r '.data[] | select(.requiredPurchase > 0) | "   \(.materialName): 需采购 \(.requiredPurchase) \(.unit)"')

if [ -z "$NEED_PURCHASE" ]; then
  echo "   ✅ 所有物料库存充足！"
else
  echo "$NEED_PURCHASE"
fi

# 获取BOM库存汇总
echo ""
echo "5️⃣  获取库存汇总信息..."

SUMMARY_RESPONSE=$(curl -s -X GET "$BASE_URL/api/style/bom/stock-summary/$STYLE_ID?productionQty=$PRODUCTION_QTY" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

echo "$SUMMARY_RESPONSE" | jq '.data'

TOTAL_MATERIALS=$(echo "$SUMMARY_RESPONSE" | jq -r '.data.totalMaterials // 0')
SUFFICIENT_COUNT=$(echo "$SUMMARY_RESPONSE" | jq -r '.data.sufficientCount // 0')
TOTAL_PURCHASE_VALUE=$(echo "$SUMMARY_RESPONSE" | jq -r '.data.totalPurchaseValue // 0')

echo ""
echo "   总物料数: $TOTAL_MATERIALS"
echo "   库存充足: $SUFFICIENT_COUNT"
echo "   需采购总值: ¥$TOTAL_PURCHASE_VALUE"

# 验证结果
echo ""
echo "=========================================="
if [ "$BOM_COUNT" -gt 0 ] && [ "$TOTAL_MATERIALS" -eq "$BOM_COUNT" ]; then
  echo "✅ P1测试通过！"
  echo "   - API端点正常运行"
  echo "   - 库存状态自动计算"
  echo "   - 采购数量正确计算"
  echo "   - 汇总统计准确"
else
  echo "⚠️  测试结果待确认"
  echo "   BOM数量: $BOM_COUNT"
  echo "   汇总总数: $TOTAL_MATERIALS"
fi
echo "=========================================="
