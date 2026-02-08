#!/bin/bash

# ==============================================
# 面料对账结算完整流程演示脚本
# 流程：pending → approved → paid（已简化）
# ==============================================

BASE_URL="http://localhost:8088"
TIMESTAMP=$(date +%Y%m%d%H%M%S)

echo "========================================="
echo "面料对账结算流程演示"
echo "时间：$(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="
echo ""

# ==================== 1. 登录系统 ====================
echo "1️⃣  登录系统..."
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

# ==================== 2. 创建测试数据 ====================
echo "2️⃣  创建测试数据（面料→采购→入库）..."

# 创建面料
MATERIAL_CODE="RECON-${TIMESTAMP}-TEST"
echo "   创建测试面料: $MATERIAL_CODE"

MATERIAL=$(curl -s -X POST "${BASE_URL}/api/warehouse/material-database" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE}\",
    \"materialName\": \"测试对账面料\",
    \"materialType\": \"面料\",
    \"color\": \"蓝色\",
    \"fabricWidth\": \"150cm\",
    \"fabricWeight\": \"200g/m²\",
    \"fabricComposition\": \"100%棉\",
    \"unit\": \"米\",
    \"unitPrice\": 50.00,
    \"supplierName\": \"测试供应商\",
    \"remark\": \"对账结算流程测试\"
  }")

MATERIAL_ID=$(echo "$MATERIAL" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$MATERIAL_ID" ]; then
  echo "   ⚠️  面料创建失败，可能已存在"
else
  echo "   ✅ 面料创建成功 (ID: $MATERIAL_ID)"
fi

sleep 1

# 创建采购单
echo "   创建采购单..."
PURCHASE=$(curl -s -X POST "${BASE_URL}/api/production/purchase" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"materialCode\": \"${MATERIAL_CODE}\",
    \"materialName\": \"测试对账面料\",
    \"materialType\": \"面料\",
    \"specifications\": \"150cm\",
    \"unit\": \"米\",
    \"color\": \"蓝色\",
    \"purchaseQuantity\": 50,
    \"unitPrice\": 50.00,
    \"totalPrice\": 2500.00,
    \"supplierName\": \"测试供应商\",
    \"buyerId\": \"1\",
    \"buyerName\": \"采购经理\",
    \"receiverName\": \"仓库管理员\",
    \"expectedDeliveryDate\": \"2026-02-15\",
    \"status\": \"pending\",
    \"sourceType\": \"manual\",
    \"remark\": \"对账结算测试-${TIMESTAMP}\"
  }")

# 从数据库查询采购单ID
sleep 1
PURCHASE_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_purchase WHERE material_code='${MATERIAL_CODE}' AND remark LIKE '%${TIMESTAMP}%' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

if [ -z "$PURCHASE_ID" ]; then
  echo "   ❌ 采购单创建失败"
  exit 1
fi

echo "   ✅ 采购单创建成功 (ID: $PURCHASE_ID)"

sleep 1

# 执行入库操作（会自动创建对账单）
echo "   执行入库操作（自动生成对账单）..."
INBOUND=$(curl -s -X POST "${BASE_URL}/api/production/material/inbound/confirm-arrival" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"purchaseId\": \"${PURCHASE_ID}\",
    \"arrivedQuantity\": 50,
    \"warehouseLocation\": \"A区-测试货架\",
    \"operatorId\": \"1\",
    \"operatorName\": \"仓库管理员\",
    \"remark\": \"对账结算测试入库\"
  }")

INBOUND_NO=$(echo "$INBOUND" | grep -o '"inboundNo":"[^"]*"' | cut -d'"' -f4)

if [ -z "$INBOUND_NO" ]; then
  echo "   ❌ 入库失败: $INBOUND"
  exit 1
fi

echo "   ✅ 入库成功 (入库单号: $INBOUND_NO)"

sleep 2

# 查询自动生成的对账单
echo "   查询自动生成的对账单..."
RECONCILIATION_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_reconciliation WHERE material_code='${MATERIAL_CODE}' AND purchase_id='${PURCHASE_ID}' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

if [ -z "$RECONCILIATION_ID" ]; then
  echo "   ❌ 未找到对账单"
  exit 1
fi

RECONCILIATION_NO=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT reconciliation_no FROM t_material_reconciliation WHERE id='${RECONCILIATION_ID}';" 2>/dev/null)

echo "   ✅ 对账单已自动生成 (ID: $RECONCILIATION_ID, 单号: $RECONCILIATION_NO)"
echo ""

# ==================== 3. 查看初始状态 ====================
echo "3️⃣  查看对账单初始状态..."
RECON_DATA=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "SELECT reconciliation_no, material_name, quantity, unit_price, total_amount, final_amount, status FROM t_material_reconciliation WHERE id='${RECONCILIATION_ID}';" 2>/dev/null)
echo "$RECON_DATA"
echo ""

# ==================== 4. 状态流转: pending → approved ====================
echo "4️⃣  审批对账单: pending → approved..."
APPROVE_RESULT=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECONCILIATION_ID}/status-action?action=update&status=approved" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$APPROVE_RESULT" | grep -q "成功"; then
  echo "   ✅ 审批通过！"
  CURRENT_STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECONCILIATION_ID}';" 2>/dev/null)
  echo "   当前状态: $CURRENT_STATUS"
else
  echo "   ⚠️  审批失败: $APPROVE_RESULT"
fi

sleep 1
echo ""

# ==================== 5. 状态流转: approved → paid ====================
echo "5️⃣  确认付款: approved → paid..."
PAID_RESULT=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECONCILIATION_ID}/status-action?action=update&status=paid" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}")

if echo "$PAID_RESULT" | grep -q "成功"; then
  echo "   ✅ 付款完成！"
  CURRENT_STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECONCILIATION_ID}';" 2>/dev/null)
  echo "   当前状态: $CURRENT_STATUS"
else
  echo "   ⚠️  付款失败: $PAID_RESULT"
fi

sleep 1
echo ""

# ==================== 6. 查看最终结果 ====================
echo "6️⃣  查看对账单最终状态..."
echo ""
FINAL_DATA=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "
SELECT
  reconciliation_no as '对账单号',
  material_name as '物料名称',
  quantity as '数量',
  unit_price as '单价',
  total_amount as '总金额',
  final_amount as '最终金额',
  status as '状态',
  approved_at as '审批时间',
  paid_at as '付款时间'
FROM t_material_reconciliation
WHERE id='${RECONCILIATION_ID}';
" 2>/dev/null)

echo "$FINAL_DATA"
echo ""

# ==================== 7. 状态流转历史 ====================
echo "7️⃣  状态流转记录..."
echo "   pending（待审批） → approved（已审批） → paid（已付款）"
echo ""
echo "   ✅ 完整流程已演示完毕！"
echo ""

# ==================== 8. 额外功能演示 ====================
echo "=========================================
📚 额外功能说明
=========================================

1️⃣  驳回操作（需要主管权限）
   curl -X POST \"${BASE_URL}/api/finance/material-reconciliation/${RECONCILIATION_ID}/status-action?action=update&status=rejected\" \
     -H \"Authorization: Bearer \${TOKEN}\"

2️⃣  退回到上一状态（需要主管权限）
   curl -X POST \"${BASE_URL}/api/finance/material-reconciliation/${RECONCILIATION_ID}/status-action?action=return&reason=需要重新核对数量\" \
     -H \"Authorization: Bearer \${TOKEN}\"

3️⃣  查询所有待处理对账单
   curl -X GET \"${BASE_URL}/api/finance/material-reconciliation/list?status=pending\" \
     -H \"Authorization: Bearer \${TOKEN}\"

4️⃣  批量审批（前端实现）
   - 选择多个对账单
   - 逐个调用 status-action API

=========================================
📊 测试数据信息
=========================================

对账单ID: ${RECONCILIATION_ID}
对账单号: ${RECONCILIATION_NO}
物料编码: ${MATERIAL_CODE}
采购单ID: ${PURCHASE_ID}
入库单号: ${INBOUND_NO}

数量: 50米
单价: ¥50.00/米
总金额: ¥2,500.00

前端查看路径: 财务管理 → 面料对账

=========================================
✅ 对账结算流程演示完成！
=========================================
"

# 保存测试数据ID，方便清理
echo ""
echo "💡 提示：可以使用以下命令清理测试数据："
echo "docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \"DELETE FROM t_material_reconciliation WHERE id='${RECONCILIATION_ID}'; DELETE FROM t_material_inbound WHERE purchase_id='${PURCHASE_ID}'; DELETE FROM t_material_purchase WHERE id='${PURCHASE_ID}'; DELETE FROM t_material_database WHERE material_code='${MATERIAL_CODE}';\""
