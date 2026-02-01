#!/bin/bash

# 测试采购完成后的进度计算功能
# 功能：采购确认后，进度应该从 0% 变为 (1/节点数)*100

set -e

DB_HOST="127.0.0.1"
DB_PORT="3308"
DB_USER="root"
DB_PASS="changeme"
DB_NAME="fashion_supplychain"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== 测试采购完成进度计算功能 ===${NC}"
echo ""

# 步骤1：查看测试订单当前状态
echo -e "${YELLOW}步骤1：查看测试订单当前状态${NC}"
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -e "
SELECT
  order_no as '订单号',
  production_progress as '进度%',
  procurement_manually_completed as '采购确认',
  JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')) as '节点数',
  ROUND(100.0 / JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')), 0) as '预期进度%'
FROM t_production_order
WHERE order_no IN ('PO20260201001', 'PO20260201002', 'PO20260123001')
ORDER BY order_no;
" 2>&1 | grep -v "Warning"
echo ""

# 步骤2：等待后端完全启动
echo -e "${YELLOW}步骤2：等待后端服务启动...${NC}"
MAX_WAIT=60
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
  if curl -s http://localhost:8080/actuator/health 2>&1 | grep -q '"status":"UP"'; then
    echo -e "${GREEN}✅ 后端服务已启动${NC}"
    break
  fi
  echo "等待中... ($WAITED/$MAX_WAIT 秒)"
  sleep 3
  WAITED=$((WAITED + 3))
done

if [ $WAITED -ge $MAX_WAIT ]; then
  echo -e "${RED}❌ 后端服务启动超时${NC}"
  echo "请手动启动后端服务，然后重新运行本脚本"
  exit 1
fi
echo ""

# 步骤3：获取登录Token（使用admin账户）
echo -e "${YELLOW}步骤3：获取登录Token...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "123456"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | sed 's/"token":"\([^"]*\)"/\1/')

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ 登录失败${NC}"
  echo "响应: $LOGIN_RESPONSE"
  exit 1
fi
echo -e "${GREEN}✅ 登录成功${NC}"
echo ""

# 步骤4：确认订单PO20260201001的采购（8个节点，预期13%）
echo -e "${YELLOW}步骤4：确认订单 PO20260201001 的采购（8节点→预期13%）${NC}"
ORDER_ID=$(mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT id FROM t_production_order WHERE order_no='PO20260201001';
" 2>&1 | grep -v "Warning")

CONFIRM_RESPONSE=$(curl -s -X POST "http://localhost:8080/api/production-order/orchestration/confirm-procurement?orderId=$ORDER_ID&remark=测试采购确认" \
  -H "Authorization: Bearer $TOKEN")

echo "API响应: $CONFIRM_RESPONSE"
echo ""

# 步骤5：验证进度是否更新
echo -e "${YELLOW}步骤5：验证订单进度是否已更新${NC}"
sleep 2  # 等待数据库写入
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -e "
SELECT
  order_no as '订单号',
  production_progress as '当前进度%',
  procurement_manually_completed as '采购确认',
  procurement_confirmed_by_name as '确认人',
  procurement_confirmed_at as '确认时间',
  JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')) as '节点数',
  ROUND(100.0 / JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')), 0) as '预期进度%',
  CASE
    WHEN production_progress = ROUND(100.0 / JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')), 0)
    THEN '✅ 正确'
    ELSE '❌ 错误'
  END as '验证结果'
FROM t_production_order
WHERE order_no = 'PO20260201001';
" 2>&1 | grep -v "Warning"
echo ""

# 步骤6：测试第二个订单（8个节点）
echo -e "${YELLOW}步骤6：确认订单 PO20260201002 的采购（8节点→预期13%）${NC}"
ORDER_ID2=$(mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT id FROM t_production_order WHERE order_no='PO20260201002';
" 2>&1 | grep -v "Warning")

CONFIRM_RESPONSE2=$(curl -s -X POST "http://localhost:8080/api/production-order/orchestration/confirm-procurement?orderId=$ORDER_ID2&remark=测试采购确认2" \
  -H "Authorization: Bearer $TOKEN")

echo "API响应: $CONFIRM_RESPONSE2"
echo ""

# 步骤7：测试第三个订单（7个节点）
echo -e "${YELLOW}步骤7：确认订单 PO20260123001 的采购（7节点→预期14%）${NC}"
ORDER_ID3=$(mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT id FROM t_production_order WHERE order_no='PO20260123001';
" 2>&1 | grep -v "Warning")

CONFIRM_RESPONSE3=$(curl -s -X POST "http://localhost:8080/api/production-order/orchestration/confirm-procurement?orderId=$ORDER_ID3&remark=测试采购确认3" \
  -H "Authorization: Bearer $TOKEN")

echo "API响应: $CONFIRM_RESPONSE3"
echo ""

# 步骤8：查看所有订单的最终状态
echo -e "${YELLOW}步骤8：查看所有测试订单的最终状态${NC}"
sleep 2
mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -e "
SELECT
  order_no as '订单号',
  production_progress as '当前进度%',
  procurement_manually_completed as '采购确认',
  procurement_confirmed_by_name as '确认人',
  JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')) as '节点数',
  ROUND(100.0 / JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')), 0) as '预期进度%',
  CASE
    WHEN production_progress = ROUND(100.0 / JSON_LENGTH(JSON_EXTRACT(progress_workflow_json, '\$.nodes')), 0)
    THEN '✅ 正确'
    ELSE '❌ 错误'
  END as '验证结果'
FROM t_production_order
WHERE order_no IN ('PO20260201001', 'PO20260201002', 'PO20260123001')
ORDER BY order_no;
" 2>&1 | grep -v "Warning"
echo ""

# 总结
echo -e "${GREEN}=== 测试完成 ===${NC}"
echo ""
echo "预期结果："
echo "  - PO20260201001 (8节点): 0% → 13%"
echo "  - PO20260201002 (8节点): 0% → 13%"
echo "  - PO20260123001 (7节点): 0% → 14%"
echo ""
echo "如果所有订单的'验证结果'都是 ✅，说明功能正常！"
echo ""

# 清理：重置测试数据
echo -e "${YELLOW}是否重置测试数据？(y/n)${NC}"
read -p "输入选择: " RESET_CHOICE

if [ "$RESET_CHOICE" = "y" ] || [ "$RESET_CHOICE" = "Y" ]; then
  echo "重置测试订单..."
  mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASS $DB_NAME -e "
  UPDATE t_production_order
  SET
    production_progress = 0,
    procurement_manually_completed = 0,
    procurement_confirmed_by = NULL,
    procurement_confirmed_by_name = NULL,
    procurement_confirmed_at = NULL,
    procurement_confirm_remark = NULL
  WHERE order_no IN ('PO20260201001', 'PO20260201002', 'PO20260123001');
  " 2>&1 | grep -v "Warning"
  echo -e "${GREEN}✅ 测试数据已重置${NC}"
fi
