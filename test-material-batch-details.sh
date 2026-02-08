#!/bin/bash

# 测试面辅料批次明细查询功能
# 测试场景：
# 1. 先手动入库一批物料
# 2. 查询该物料的批次明细
# 3. 验证批次数据完整性

BASE_URL="http://localhost:8088"
MATERIAL_CODE="TEST-FABRIC-$(date +%s)"
COLOR="红色"

echo "========================================="
echo "面辅料批次明细查询功能测试"
echo "========================================="
echo ""

# 获取登录token
echo "1️⃣  登录系统..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  exit 1
fi
echo "✅ 登录成功"
echo ""

# 第一次入库
echo "2️⃣  第一次入库 (批次1)..."
INBOUND1=$(curl -s -X POST "${BASE_URL}/api/production/material/inbound/manual" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE}\",
    \"materialName\": \"测试面料\",
    \"materialType\": \"面料\",
    \"color\": \"${COLOR}\",
    \"size\": \"\",
    \"quantity\": 1000,
    \"warehouseLocation\": \"A-01-01\",
    \"supplierName\": \"测试供应商\",
    \"operatorId\": \"1\",
    \"operatorName\": \"管理员\",
    \"remark\": \"批次1测试入库\"
  }")

INBOUND_NO1=$(echo $INBOUND1 | grep -o '"inboundNo":"[^"]*"' | cut -d'"' -f4)
echo "入库单号1: $INBOUND_NO1"
echo ""

# 等待1秒，确保时间戳不同
sleep 1

# 第二次入库
echo "3️⃣  第二次入库 (批次2)..."
INBOUND2=$(curl -s -X POST "${BASE_URL}/api/production/material/inbound/manual" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE}\",
    \"materialName\": \"测试面料\",
    \"materialType\": \"面料\",
    \"color\": \"${COLOR}\",
    \"size\": \"\",
    \"quantity\": 800,
    \"warehouseLocation\": \"A-01-02\",
    \"supplierName\": \"测试供应商\",
    \"operatorId\": \"1\",
    \"operatorName\": \"管理员\",
    \"remark\": \"批次2测试入库\"
  }")

INBOUND_NO2=$(echo $INBOUND2 | grep -o '"inboundNo":"[^"]*"' | cut -d'"' -f4)
echo "入库单号2: $INBOUND_NO2"
echo ""

# 等待1秒
sleep 1

# 第三次入库
echo "4️⃣  第三次入库 (批次3)..."
INBOUND3=$(curl -s -X POST "${BASE_URL}/api/production/material/inbound/manual" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE}\",
    \"materialName\": \"测试面料\",
    \"materialType\": \"面料\",
    \"color\": \"${COLOR}\",
    \"size\": \"\",
    \"quantity\": 600,
    \"warehouseLocation\": \"A-02-01\",
    \"supplierName\": \"测试供应商\",
    \"operatorId\": \"1\",
    \"operatorName\": \"管理员\",
    \"remark\": \"批次3测试入库\"
  }")

INBOUND_NO3=$(echo $INBOUND3 | grep -o '"inboundNo":"[^"]*"' | cut -d'"' -f4)
echo "入库单号3: $INBOUND_NO3"
echo ""

# 查询批次明细
echo "5️⃣  查询批次明细..."
echo "查询参数: materialCode=${MATERIAL_CODE}, color=${COLOR}"
echo ""

BATCH_RESPONSE=$(curl -s -X GET "${BASE_URL}/api/production/material/stock/batches?materialCode=${MATERIAL_CODE}&color=$(echo $COLOR | sed 's/ /%20/g')" \
  -H "Authorization: Bearer ${TOKEN}")

echo "========================================="
echo "批次明细查询结果:"
echo "========================================="
echo "$BATCH_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$BATCH_RESPONSE"
echo ""

# 验证批次数量
BATCH_COUNT=$(echo $BATCH_RESPONSE | grep -o '"batchNo"' | wc -l | tr -d ' ')
echo "========================================="
echo "验证结果:"
echo "========================================="
echo "批次数量: $BATCH_COUNT (预期: 3)"

if [ "$BATCH_COUNT" -eq 3 ]; then
  echo "✅ 批次数量正确"
else
  echo "⚠️  批次数量不符合预期"
fi

# 验证总可用库存
TOTAL_AVAILABLE=$(echo $BATCH_RESPONSE | grep -o '"availableQty":[0-9]*' | cut -d':' -f2 | awk '{s+=$1} END {print s}')
echo "总可用库存: ${TOTAL_AVAILABLE} (预期: 2400 = 1000+800+600)"

if [ "$TOTAL_AVAILABLE" -eq 2400 ]; then
  echo "✅ 总库存正确"
else
  echo "⚠️  总库存不符合预期"
fi

# 验证FIFO排序
echo ""
echo "========================================="
echo "FIFO排序验证:"
echo "========================================="
echo "批次应按入库时间升序排列（先进先出原则）"
echo "批次1: $INBOUND_NO1 (最早入库，应排第一)"
echo "批次2: $INBOUND_NO2"
echo "批次3: $INBOUND_NO3 (最晚入库，应排最后)"
echo ""

FIRST_BATCH=$(echo $BATCH_RESPONSE | grep -o '"batchNo":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "实际第一个批次: $FIRST_BATCH"

if [ "$FIRST_BATCH" = "$INBOUND_NO1" ]; then
  echo "✅ FIFO排序正确"
else
  echo "⚠️  FIFO排序可能有问题"
fi

echo ""
echo "========================================="
echo "测试完成！"
echo "========================================="
echo ""
echo "📌 提示："
echo "1. 可在前端「面辅料进销存」页面查看物料: ${MATERIAL_CODE}"
echo "2. 点击「出库」按钮，应该能看到3个批次的详细信息"
echo "3. 批次按入库时间升序排列（FIFO先进先出）"
echo ""
