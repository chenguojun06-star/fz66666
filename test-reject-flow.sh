#!/bin/bash

# 测试驳回流程
BASE_URL="http://localhost:8088"

echo "测试驳回流程"
echo "============================================="

# 登录
LOGIN=$(curl -s -X POST "${BASE_URL}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo "$LOGIN" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ 登录失败"
  exit 1
fi

echo "✅ 登录成功"

# 获取一个现有的对账单ID（状态为approved）
echo ""
echo "查询现有的对账单..."
RECON_ID=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT id FROM t_material_reconciliation WHERE status='approved' ORDER BY create_time DESC LIMIT 1;" 2>/dev/null)

if [ -z "$RECON_ID" ]; then
  echo "❌ 没有找到状态为approved的对账单"
  echo "提示：先运行 test-reconciliation-flow.sh 创建测试数据"
  exit 1
fi

echo "找到对账单ID: $RECON_ID"

# 查看当前状态
CURRENT_STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
echo "当前状态: $CURRENT_STATUS"

# 测试驳回
echo ""
echo "测试驳回：approved → rejected..."
RESULT=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=rejected" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

echo "返回结果: $RESULT"

if echo "$RESULT" | grep -q "成功"; then
  echo "✅ 驳回成功"

  # 验证状态
  NEW_STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
  echo "新状态: $NEW_STATUS"

  # 测试重新提交
  echo ""
  echo "测试重新提交：rejected → pending..."
  RESULT2=$(curl -s -X POST "${BASE_URL}/api/finance/material-reconciliation/${RECON_ID}/status-action?action=update&status=pending" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json")

  echo "返回结果: $RESULT2"

  if echo "$RESULT2" | grep -q "成功"; then
    echo "✅ 重新提交成功"
    FINAL_STATUS=$(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -s -N -e "SELECT status FROM t_material_reconciliation WHERE id='${RECON_ID}';" 2>/dev/null)
    echo "最终状态: $FINAL_STATUS"
  else
    echo "❌ 重新提交失败"
  fi
else
  echo "❌ 驳回失败"
fi

echo ""
echo "============================================="
echo "测试完成"
