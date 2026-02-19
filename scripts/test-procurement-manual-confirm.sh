#!/bin/bash

# 测试采购手动确认功能
# 场景：物料到货率在50%-99%之间时，允许人工确认采购完成

set -e

echo "=========================================="
echo "采购手动确认功能测试"
echo "=========================================="

# 配置
BASE_URL="http://localhost:8080"
API_PREFIX="/api/production/order"

# 需要替换为实际的token和订单ID
TOKEN="YOUR_JWT_TOKEN_HERE"
ORDER_ID="YOUR_ORDER_ID_HERE"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "⚠️  请先手动配置以下参数："
echo "   TOKEN: JWT认证token"
echo "   ORDER_ID: 测试订单ID（需要物料到货率在50%-99%之间）"
echo ""

# 检查参数
if [ "$TOKEN" = "YOUR_JWT_TOKEN_HERE" ]; then
    echo -e "${RED}❌ 错误: 请先设置TOKEN变量${NC}"
    exit 1
fi

if [ "$ORDER_ID" = "YOUR_ORDER_ID_HERE" ]; then
    echo -e "${RED}❌ 错误: 请先设置ORDER_ID变量${NC}"
    exit 1
fi

echo "=========================================="
echo "测试步骤："
echo "=========================================="

# 步骤1: 查询订单详情，检查物料到货率
echo ""
echo -e "${YELLOW}步骤1: 查询订单详情${NC}"
echo "GET ${BASE_URL}${API_PREFIX}/detail/${ORDER_ID}"

DETAIL_RESPONSE=$(curl -s -X GET \
  "${BASE_URL}${API_PREFIX}/detail/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

echo "Response: ${DETAIL_RESPONSE}"

# 解析物料到货率（简单示例，实际应用中可用jq）
MATERIAL_RATE=$(echo "${DETAIL_RESPONSE}" | grep -o '"materialArrivalRate":[0-9.]*' | cut -d':' -f2 || echo "0")
echo "物料到货率: ${MATERIAL_RATE}%"

if [ -z "$MATERIAL_RATE" ] || [ "$MATERIAL_RATE" = "0" ]; then
    echo -e "${RED}❌ 错误: 无法获取物料到货率，请检查订单ID和token${NC}"
    exit 1
fi

# 步骤2: 尝试确认采购完成（需要备注）
echo ""
echo -e "${YELLOW}步骤2: 手动确认采购完成${NC}"
echo "POST ${BASE_URL}${API_PREFIX}/confirm-procurement"

REMARK="测试确认：由于供应商临时缺货，当前物料到货率${MATERIAL_RATE}%，经与生产经理协商，决定先开工生产，缺少部分稍后补齐。"

CONFIRM_RESPONSE=$(curl -s -X POST \
  "${BASE_URL}${API_PREFIX}/confirm-procurement" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"${ORDER_ID}\",
    \"remark\": \"${REMARK}\"
  }")

echo "Response: ${CONFIRM_RESPONSE}"

# 检查响应
if echo "${CONFIRM_RESPONSE}" | grep -q '"code":200'; then
    echo -e "${GREEN}✅ 确认成功${NC}"
elif echo "${CONFIRM_RESPONSE}" | grep -q '"code":400'; then
    ERROR_MSG=$(echo "${CONFIRM_RESPONSE}" | grep -o '"message":"[^"]*"' | cut -d':' -f2 | tr -d '"')
    echo -e "${RED}❌ 确认失败: ${ERROR_MSG}${NC}"
    exit 1
else
    echo -e "${RED}❌ 未知错误${NC}"
    exit 1
fi

# 步骤3: 再次查询订单详情，验证确认状态
echo ""
echo -e "${YELLOW}步骤3: 验证确认状态${NC}"
echo "GET ${BASE_URL}${API_PREFIX}/detail/${ORDER_ID}"

VERIFY_RESPONSE=$(curl -s -X GET \
  "${BASE_URL}${API_PREFIX}/detail/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

echo "Response: ${VERIFY_RESPONSE}"

# 检查确认字段
if echo "${VERIFY_RESPONSE}" | grep -q '"procurementManuallyCompleted":true'; then
    echo -e "${GREEN}✅ 采购已手动确认完成${NC}"
else
    echo -e "${RED}❌ 采购确认状态异常${NC}"
fi

if echo "${VERIFY_RESPONSE}" | grep -q '"procurementConfirmRemark"'; then
    echo -e "${GREEN}✅ 确认备注已保存${NC}"
else
    echo -e "${YELLOW}⚠️  确认备注未找到${NC}"
fi

if echo "${VERIFY_RESPONSE}" | grep -q '"procurementConfirmedAt"'; then
    echo -e "${GREEN}✅ 确认时间已记录${NC}"
else
    echo -e "${YELLOW}⚠️  确认时间未找到${NC}"
fi

# 步骤4: 检查当前工序是否允许进入下一阶段
if echo "${VERIFY_RESPONSE}" | grep -q '"currentProcessName":"裁剪"'; then
    echo -e "${GREEN}✅ 订单已进入裁剪阶段${NC}"
elif echo "${VERIFY_RESPONSE}" | grep -q '"currentProcessName":"采购"'; then
    echo -e "${YELLOW}⚠️  订单仍在采购阶段，可能需要更新进度触发重算${NC}"
fi

echo ""
echo "=========================================="
echo "测试完成"
echo "=========================================="

# 边界测试建议
echo ""
echo -e "${YELLOW}建议进行以下边界测试：${NC}"
echo "1. 物料到货率 < 50%: 应拒绝确认"
echo "2. 物料到货率 = 100%: 应提示无需确认"
echo "3. 备注字数 < 10: 应提示备注太短"
echo "4. 重复确认: 应提示已确认"
echo ""
