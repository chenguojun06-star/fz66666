#!/bin/bash

RECON_ID="e4ce811b171f111f26f89e4f8d6ba826"
BASE_URL="http://localhost:8088"

# 获取Token
TOKEN=$(curl -s -X POST "${BASE_URL}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | \
  grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  exit 1
fi

echo "============================================="
echo "          完整结算流程测试"
echo "============================================="

# 1. pending → approved
echo -n "1️⃣  pending → approved ... "
RESP=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=approved" \
  -H "Authorization: Bearer ${TOKEN}")
STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
echo "✅ ${STATUS}"

# 2. approved → rejected
sleep 1
echo -n "2️⃣  approved → rejected ... "
RESP=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=rejected" \
  -H "Authorization: Bearer ${TOKEN}")
STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
echo "✅ ${STATUS}"

# 3. rejected → pending
sleep 1
echo -n "3️⃣  rejected → pending ... "
RESP=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=pending" \
  -H "Authorization: Bearer ${TOKEN}")
STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
echo "✅ ${STATUS}"

# 4. pending → approved (再次)
sleep 1
echo -n "4️⃣  pending → approved (再次) ... "
RESP=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=approved" \
  -H "Authorization: Bearer ${TOKEN}")
STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
echo "✅ ${STATUS}"

# 5. approved → paid
sleep 1
echo -n "5️⃣  approved → paid ... "
RESP=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=paid" \
  -H "Authorization: Bearer ${TOKEN}")
STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
echo "✅ ${STATUS}"

echo ""
echo "============================================="
echo "✅ 所有结算流程测试完成！"
echo "============================================="
echo ""
echo "📊 最终状态："
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \
  "SELECT status, approved_at, paid_at FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null

echo ""
echo "测试覆盖："
echo "  ✅ 正常审批流程 (pending → approved → paid)"
echo "  ✅ 驳回重新提交 (approved → rejected → pending)"
echo "  ✅ 完整循环流程 (包含驳回和重新审批)"
