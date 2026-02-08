#!/bin/bash

# 生产工序跟踪系统测试脚本
# 测试场景：裁剪完成 → 生成记录 → 扫码更新 → 管理员重置
# 日期：2026-02-06

set -e

API_BASE="http://localhost:8088/api"
TOKEN=""

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}生产工序跟踪系统测试${NC}"
echo -e "${GREEN}========================================${NC}\n"

# 步骤1：登录获取 Token
echo -e "${YELLOW}步骤1：登录系统${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "${API_BASE}/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo -e "${RED}✗ 登录失败${NC}"
  echo $LOGIN_RESPONSE | jq '.'
  exit 1
fi

echo -e "${GREEN}✓ 登录成功，Token: ${TOKEN:0:20}...${NC}\n"

# 步骤2：查询一个已裁剪的订单（直接使用已知订单ID）
echo -e "${YELLOW}步骤2：使用已有订单进行测试${NC}"

# 先查询有菲号的订单（使用GET方法）
BUNDLES_CHECK=$(curl -s -X GET "${API_BASE}/production/cutting/list?page=1&pageSize=1" \
  -H "Authorization: Bearer $TOKEN")

ORDER_ID=$(echo $BUNDLES_CHECK | jq -r '.data.records[0].productionOrderId // .data[0].productionOrderId // empty')
ORDER_NO=$(echo $BUNDLES_CHECK | jq -r '.data.records[0].productionOrderNo // .data[0].productionOrderNo // empty')

if [ -z "$ORDER_ID" ] || [ "$ORDER_ID" = "null" ]; then
  echo -e "${RED}✗ 未找到有菲号的订单${NC}"
  echo -e "${YELLOW}提示：请先创建订单并完成裁剪（生成菲号）${NC}"
  exit 1
fi

echo -e "${GREEN}✓ 找到订单：${ORDER_NO} (ID: ${ORDER_ID})${NC}\n"

# 步骤3：初始化工序跟踪记录
echo -e "${YELLOW}步骤3：初始化工序跟踪记录${NC}"
INIT_RESPONSE=$(curl -s -X POST "${API_BASE}/production/process-tracking/initialize/${ORDER_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json")

INIT_COUNT=$(echo $INIT_RESPONSE | jq -r '.data')

if [ -z "$INIT_COUNT" ] || [ "$INIT_COUNT" = "null" ]; then
  echo -e "${YELLOW}⚠ 可能已初始化过，继续测试${NC}"
else
  echo -e "${GREEN}✓ 初始化成功，生成 ${INIT_COUNT} 条跟踪记录${NC}"
fi

echo ""

# 步骤4：查询工序跟踪记录
echo -e "${YELLOW}步骤4：查询工序跟踪记录${NC}"
TRACKING_LIST=$(curl -s -X GET "${API_BASE}/production/process-tracking/order/${ORDER_ID}" \
  -H "Authorization: Bearer $TOKEN")

TRACKING_RECORDS=$(echo $TRACKING_LIST | jq -r '.data')
RECORD_COUNT=$(echo $TRACKING_RECORDS | jq 'length')

if [ "$RECORD_COUNT" = "0" ]; then
  echo -e "${RED}✗ 未找到跟踪记录${NC}"
  exit 1
fi

echo -e "${GREEN}✓ 查询成功，共 ${RECORD_COUNT} 条记录${NC}\n"

# 显示记录详情
echo "记录示例："
echo $TRACKING_RECORDS | jq -r '.[:3] | .[] | "\(.bundleNo) - \(.processName) - \(.scanStatus)"'
echo ""

# 步骤5：统计扫码状态
PENDING_COUNT=$(echo $TRACKING_RECORDS | jq '[.[] | select(.scanStatus == "pending")] | length')
SCANNED_COUNT=$(echo $TRACKING_RECORDS | jq '[.[] | select(.scanStatus == "scanned")] | length')

echo -e "状态统计："
echo -e "  待扫码：${YELLOW}${PENDING_COUNT}${NC}"
echo -e "  已扫码：${GREEN}${SCANNED_COUNT}${NC}\n"

# 步骤6：测试管理员重置（如果有已扫码记录）
if [ "$SCANNED_COUNT" -gt "0" ]; then
  echo -e "${YELLOW}步骤6：测试管理员重置扫码记录${NC}"

  SCANNED_ID=$(echo $TRACKING_RECORDS | jq -r '[.[] | select(.scanStatus == "scanned")][0].id')
  SCANNED_BUNDLE=$(echo $TRACKING_RECORDS | jq -r '[.[] | select(.scanStatus == "scanned")][0].bundleNo')
  SCANNED_PROCESS=$(echo $TRACKING_RECORDS | jq -r '[.[] | select(.scanStatus == "scanned")][0].processName')

  echo "选择记录：${SCANNED_BUNDLE} - ${SCANNED_PROCESS}"

  RESET_RESPONSE=$(curl -s -X POST "${API_BASE}/production/process-tracking/${SCANNED_ID}/reset" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "resetReason": "测试重置功能"
    }')

  RESET_SUCCESS=$(echo $RESET_RESPONSE | jq -r '.data')

  if [ "$RESET_SUCCESS" = "true" ]; then
    echo -e "${GREEN}✓ 重置成功${NC}\n"
  else
    echo -e "${RED}✗ 重置失败${NC}"
    echo $RESET_RESPONSE | jq '.'
  fi
else
  echo -e "${YELLOW}步骤6：跳过（无已扫码记录）${NC}\n"
fi

# 步骤7：再次查询验证
echo -e "${YELLOW}步骤7：验证最终状态${NC}"
FINAL_LIST=$(curl -s -X GET "${API_BASE}/production/process-tracking/order/${ORDER_ID}" \
  -H "Authorization: Bearer $TOKEN")

FINAL_RECORDS=$(echo $FINAL_LIST | jq -r '.data')
FINAL_PENDING=$(echo $FINAL_RECORDS | jq '[.[] | select(.scanStatus == "pending")] | length')
FINAL_SCANNED=$(echo $FINAL_RECORDS | jq '[.[] | select(.scanStatus == "scanned")] | length')
FINAL_RESET=$(echo $FINAL_RECORDS | jq '[.[] | select(.scanStatus == "reset")] | length')

echo -e "最终状态："
echo -e "  待扫码：${YELLOW}${FINAL_PENDING}${NC}"
echo -e "  已扫码：${GREEN}${FINAL_SCANNED}${NC}"
echo -e "  已重置：${RED}${FINAL_RESET}${NC}\n"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}测试完成！${NC}"
echo -e "${GREEN}========================================${NC}"

# 输出数据库检查 SQL
echo ""
echo -e "${YELLOW}数据库验证 SQL：${NC}"
echo "SELECT
  bundle_no,
  process_name,
  scan_status,
  operator_name,
  settlement_amount
FROM t_production_process_tracking
WHERE production_order_id = ${ORDER_ID}
ORDER BY bundle_no, process_order;"
