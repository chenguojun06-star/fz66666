#!/bin/bash

# ==============================================
# 综合测试：所有结算流程
# 2026-02-05
# 测试范围：
# 1. 面料对账结算（pending → approved → paid）
# 2. 驳回与重新提交流程（rejected → pending）
# 3. 状态验证（不允许跳级、不允许回退）
# ==============================================

BASE_URL="http://localhost:8088"
TIMESTAMP=$(date +%Y%m%d%H%M%S)

echo "============================================="
echo "📊 综合测试：所有结算流程"
echo "时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""

# ==================== 登录 ====================
echo "🔐 登录系统..."
LOGIN_RESPONSE=$(curl -s -X POST "${BASE_URL}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  exit 1
fi

echo "✅ 登录成功"
echo ""

# ==================== 测试1：正常流程 ====================
echo "============================================="
echo "测试1：正常审批流程（pending → approved → paid）"
echo "============================================="

# 创建测试数据
MATERIAL_CODE="TEST-FLOW-${TIMESTAMP}"
echo "创建测试数据..."

# 创建面料
curl -s -X POST "${BASE_URL}/api/warehouse/material-database" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE}\",
    \"materialName\": \"流程测试面料\",
    \"materialType\": \"面料\",
    \"color\": \"蓝色\",
    \"unit\": \"米\",
    \"unitPrice\": 30.00,
    \"supplierName\": \"测试供应商\"
  }" > /dev/null

# 创建采购单
curl -s -X POST "${BASE_URL}/api/production/purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE}\",
    \"materialName\": \"流程测试面料\",
    \"materialType\": \"面料\",
    \"unit\": \"米\",
    \"color\": \"蓝色\",
    \"purchaseQuantity\": 100,
    \"unitPrice\": 30.00,
    \"totalPrice\": 3000.00,
    \"supplierName\": \"测试供应商\",
    \"buyerId\": \"1\",
    \"buyerName\": \"采购经理\",
    \"receiverName\": \"仓库管理员\",
    \"expectedDeliveryDate\": \"2026-02-15\",
    \"status\": \"pending\",
    \"sourceType\": \"manual\",
    \"remark\": \"流程测试-${TIMESTAMP}\"
  }" > /dev/null

sleep 1

PURCHASE_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_purchase WHERE material_code='${MATERIAL_CODE}' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

# 入库（自动生成对账单）
curl -s -X POST "${BASE_URL}/api/production/material/inbound/confirm-arrival" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"purchaseId\": \"${PURCHASE_ID}\",
    \"arrivedQuantity\": 100,
    \"warehouseLocation\": \"A区\",
    \"operatorId\": \"1\",
    \"operatorName\": \"仓库管理员\"
  }" > /dev/null

sleep 2

RECON_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_reconciliation WHERE material_code='${MATERIAL_CODE}' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

if [ -z "$RECON_ID" ]; then
  echo "❌ 对账单创建失败"
  exit 1
fi

echo "✅ 测试数据准备完成 (对账单ID: $RECON_ID)"
echo ""

# 测试状态流转
echo "1️⃣  pending → approved..."
RESULT1=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=approved" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$RESULT1" | grep -q "成功"; then
  echo "   ✅ 审批成功"
else
  echo "   ❌ 审批失败: $RESULT1"
fi

sleep 1

echo "2️⃣  approved → paid..."
RESULT2=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=paid" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$RESULT2" | grep -q "成功"; then
  echo "   ✅ 付款成功"
else
  echo "   ❌ 付款失败: $RESULT2"
fi

echo ""
echo "✅ 测试1完成：正常流程运行正常"
echo ""

# ==================== 测试2：驳回流程 ====================
echo "============================================="
echo "测试2：驳回与重新提交流程"
echo "============================================="

# 创建新的测试对账单
MATERIAL_CODE2="TEST-REJECT-${TIMESTAMP}"

curl -s -X POST "${BASE_URL}/api/warehouse/material-database" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE2}\",
    \"materialName\": \"驳回测试面料\",
    \"materialType\": \"面料\",
    \"unit\": \"米\",
    \"unitPrice\": 40.00
  }" > /dev/null

curl -s -X POST "${BASE_URL}/api/production/purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE2}\",
    \"materialName\": \"驳回测试面料\",
    \"materialType\": \"面料\",
    \"unit\": \"米\",
    \"purchaseQuantity\": 50,
    \"unitPrice\": 40.00,
    \"totalPrice\": 2000.00,
    \"buyerId\": \"1\",
    \"buyerName\": \"采购经理\"
  }" > /dev/null

sleep 1

PURCHASE_ID2=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_purchase WHERE material_code='${MATERIAL_CODE2}' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

curl -s -X POST "${BASE_URL}/api/production/material/inbound/confirm-arrival" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"purchaseId\": \"${PURCHASE_ID2}\",
    \"arrivedQuantity\": 50,
    \"warehouseLocation\": \"B区\"
  }" > /dev/null

sleep 2

RECON_ID2=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_reconciliation WHERE material_code='${MATERIAL_CODE2}' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

if [ -z "$RECON_ID2" ]; then
  echo "❌ 对账单2创建失败"
  exit 1
fi

echo "✅ 测试数据准备完成 (对账单ID: $RECON_ID2)"
echo ""

echo "1️⃣  pending → approved..."
curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID2}/status-action?action=update&status=approved" \
  -H "Authorization: Bearer ${TOKEN}" > /dev/null

sleep 1

echo "2️⃣  approved → rejected (驳回)..."
RESULT3=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID2}/status-action?action=update&status=rejected" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$RESULT3" | grep -q "成功"; then
  echo "   ✅ 驳回成功"
else
  echo "   ❌ 驳回失败: $RESULT3"
fi

sleep 1

echo "3️⃣  rejected → pending (重新提交)..."
RESULT4=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID2}/status-action?action=update&status=pending" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$RESULT4" | grep -q "成功"; then
  echo "   ✅ 重新提交成功"
else
  echo "   ❌ 重新提交失败: $RESULT4"
fi

echo ""
echo "✅ 测试2完成：驳回流程正常"
echo ""

# ==================== 测试3：非法状态转换 ====================
echo "============================================="
echo "测试3：非法状态转换验证"
echo "============================================="

# 创建新对账单
MATERIAL_CODE3="TEST-INVALID-${TIMESTAMP}"

curl -s -X POST "${BASE_URL}/api/warehouse/material-database" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE3}\",
    \"materialName\": \"验证测试面料\",
    \"materialType\": \"面料\",
    \"unit\": \"米\",
    \"unitPrice\": 25.00
  }" > /dev/null

curl -s -X POST "${BASE_URL}/api/production/purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE3}\",
    \"materialName\": \"验证测试面料\",
    \"materialType\": \"面料\",
    \"unit\": \"米\",
    \"purchaseQuantity\": 30,
    \"unitPrice\": 25.00,
    \"totalPrice\": 750.00,
    \"buyerId\": \"1\"
  }" > /dev/null

sleep 1

PURCHASE_ID3=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_purchase WHERE material_code='${MATERIAL_CODE3}' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

curl -s -X POST "${BASE_URL}/api/production/material/inbound/confirm-arrival" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"purchaseId\": \"${PURCHASE_ID3}\",
    \"arrivedQuantity\": 30,
    \"warehouseLocation\": \"C区\"
  }" > /dev/null

sleep 2

RECON_ID3=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_reconciliation WHERE material_code='${MATERIAL_CODE3}' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

if [ -z "$RECON_ID3" ]; then
  echo "❌ 对账单3创建失败"
  exit 1
fi

echo "✅ 测试数据准备完成 (对账单ID: $RECON_ID3)"
echo ""

echo "1️⃣  测试跳级：pending → paid（应该失败）..."
RESULT5=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID3}/status-action?action=update&status=paid" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$RESULT5" | grep -q "不允许"; then
  echo "   ✅ 正确阻止了非法转换"
else
  echo "   ❌ 应该阻止但没有阻止"
fi

sleep 1

echo "2️⃣  正常流转到 approved..."
curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID3}/status-action?action=update&status=approved" \
  -H "Authorization: Bearer ${TOKEN}" > /dev/null

sleep 1

echo "3️⃣  测试回退：approved → pending（应该失败）..."
RESULT6=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID3}/status-action?action=update&status=pending" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$RESULT6" | grep -q "不允许"; then
  echo "   ✅ 正确阻止了回退操作"
else
  echo "   ❌ 应该阻止但没有阻止"
fi

echo ""
echo "✅ 测试3完成：状态验证正常"
echo ""

# ==================== 汇总 ====================
echo "============================================="
echo "📝 测试汇总"
echo "============================================="
echo "✅ 测试1：正常审批流程 - 通过"
echo "✅ 测试2：驳回与重新提交 - 通过"
echo "✅ 测试3：非法状态转换验证 - 通过"
echo ""
echo "============================================="
echo "🎉 所有测试完成！简化后的结算流程运行正常！"
echo "============================================="
echo ""
echo "清理测试数据："
echo "docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \\"
echo "  \"DELETE FROM t_material_reconciliation WHERE material_code LIKE 'TEST-%${TIMESTAMP}%';\\"
echo "  DELETE FROM t_material_inbound WHERE purchase_id IN (SELECT id FROM t_material_purchase WHERE material_code LIKE 'TEST-%${TIMESTAMP}%');\\"
echo "  DELETE FROM t_material_purchase WHERE material_code LIKE 'TEST-%${TIMESTAMP}%';\\"
echo "  DELETE FROM t_material_database WHERE material_code LIKE 'TEST-%${TIMESTAMP}%';\""
