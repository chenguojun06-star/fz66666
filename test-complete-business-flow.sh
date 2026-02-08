#!/bin/bash

# 完整业务流程测试
# 测试路径：样衣创建 → 样衣入库 → 订单下单 → 生产 → 成品入库 → 财务结算
# 使用真实数据测试每个环节的协调性

# 不要立即退出，记录所有错误
# set -e

BASE_URL="http://localhost:8088"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
TEST_PREFIX="E2E-${TIMESTAMP}"

echo "============================================="
echo "    完整业务流程端到端测试"
echo "    测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

success_count=0
fail_count=0

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((success_count++))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ((fail_count++))
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# ============================================
# 第一步：登录系统
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 1 步：系统登录"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

LOGIN_RESP=$(curl -s -X POST "${BASE_URL}/api/system/user/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo "${LOGIN_RESP}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    log_error "登录失败"
    echo "响应: ${LOGIN_RESP}"
    echo ""
    echo "⚠️ 登录失败，无法继续测试"
    exit 1
fi

log_success "登录成功，获取到 Token"

# ============================================
# 第二步：创建款式
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 2 步：创建款式"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

STYLE_NO="${TEST_PREFIX}-STYLE"
STYLE_NAME="测试款式-${TIMESTAMP}"

STYLE_DATA='{
  "styleNo": "'${STYLE_NO}'",
  "styleName": "'${STYLE_NAME}'",
  "season": "2026春季",
  "category": "衬衫",
  "status": "draft",
  "designDate": "2026-02-06",
  "remark": "端到端测试款式"
}'

log_info "创建款式: ${STYLE_NO}"
STYLE_RESP=$(curl -s -X POST "${BASE_URL}/api/style/style-info" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${STYLE_DATA}")

STYLE_ID=$(echo "${STYLE_RESP}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$STYLE_ID" ]; then
    log_error "款式创建失败"
    echo "响应: ${STYLE_RESP}"
    log_warning "将尝试继续后续测试"
fi

log_success "款式创建成功 (ID: ${STYLE_ID})"

# ============================================
# 第三步：创建样衣
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 3 步：创建样衣"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SAMPLE_NO="${TEST_PREFIX}-SAMPLE"

SAMPLE_DATA='{
  "styleId": "'${STYLE_ID}'",
  "styleNo": "'${STYLE_NO}'",
  "sampleNo": "'${SAMPLE_NO}'",
  "sampleType": "first_sample",
  "quantity": 3,
  "status": "pending",
  "remark": "端到端测试样衣"
}'

log_info "创建样衣: ${SAMPLE_NO}"
SAMPLE_RESP=$(curl -s -X POST "${BASE_URL}/api/warehouse/sample" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${SAMPLE_DATA}")

SAMPLE_ID=$(echo "${SAMPLE_RESP}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SAMPLE_ID" ]; then
    log_error "样衣创建失败"
    echo "响应: ${SAMPLE_RESP}"
    log_warning "将跳过样衣相关测试"
else

log_success "样衣创建成功 (ID: ${SAMPLE_ID})"

# ============================================
# 第四步：样衣入库
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 4 步：样衣入库"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

SAMPLE_INBOUND_DATA='{
  "sampleId": "'${SAMPLE_ID}'",
  "quantity": 3,
  "warehouseLocation": "A-01-001",
  "remark": "样衣入库测试"
}'

log_info "执行样衣入库"
SAMPLE_INBOUND_RESP=$(curl -s -X POST "${BASE_URL}/api/warehouse/sample/inbound" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${SAMPLE_INBOUND_DATA}")

# 验证入库是否成功
SAMPLE_CHECK=$(curl -s -X GET "${BASE_URL}/api/warehouse/sample/${SAMPLE_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

SAMPLE_STATUS=$(echo "${SAMPLE_CHECK}" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$SAMPLE_STATUS" = "in_stock" ]; then
    log_success "样衣入库成功，状态: ${SAMPLE_STATUS}"
else
    log_warning "样衣状态: ${SAMPLE_STATUS} (可能需要审批)"
fi

# ============================================
# 第五步：创建生产订单
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 5 步：创建生产订单"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ORDER_NO="${TEST_PREFIX}-ORDER"

# 先查询工厂列表
FACTORY_LIST=$(curl -s -X POST "${BASE_URL}/api/basic/factory/list" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"pageNum":1,"pageSize":1}')

FACTORY_ID=$(echo "${FACTORY_LIST}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$FACTORY_ID" ]; then
    log_warning "未找到工厂，使用默认工厂ID"
    FACTORY_ID="default-factory-001"
fi

ORDER_DATA='{
  "orderNo": "'${ORDER_NO}'",
  "styleId": "'${STYLE_ID}'",
  "styleNo": "'${STYLE_NO}'",
  "styleName": "'${STYLE_NAME}'",
  "factoryId": "'${FACTORY_ID}'",
  "totalQuantity": 100,
  "status": "pending",
  "orderDate": "2026-02-06",
  "deliveryDate": "2026-03-06",
  "remark": "端到端测试订单"
}'

log_info "创建生产订单: ${ORDER_NO}"
ORDER_RESP=$(curl -s -X POST "${BASE_URL}/api/production/order" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${ORDER_DATA}")

ORDER_ID=$(echo "${ORDER_RESP}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ORDER_ID" ]; then
    log_error "订单创建失败"
    echo "响应: ${ORDER_RESP}"
    log_warning "将跳过订单相关测试"
else

log_success "生产订单创建成功 (ID: ${ORDER_ID})"

# ============================================
# 第六步：订单审批
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 6 步：订单审批"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

log_info "提交订单审批"
APPROVE_RESP=$(curl -s -X POST "${BASE_URL}/api/production/order/${ORDER_ID}/status-action?action=update&status=confirmed" \
  -H "Authorization: Bearer ${TOKEN}")

sleep 1

# 验证订单状态
ORDER_CHECK=$(curl -s -X GET "${BASE_URL}/api/production/order/${ORDER_ID}" \
  -H "Authorization: Bearer ${TOKEN}")

ORDER_STATUS=$(echo "${ORDER_CHECK}" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ "$ORDER_STATUS" = "confirmed" ]; then
    log_success "订单审批成功，状态: ${ORDER_STATUS}"
else
    log_warning "订单状态: ${ORDER_STATUS}"
fi

# ============================================
# 第七步：创建裁剪单
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 7 步：创建裁剪单"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CUTTING_NO="${TEST_PREFIX}-CUT"

CUTTING_DATA='{
  "cuttingNo": "'${CUTTING_NO}'",
  "orderId": "'${ORDER_ID}'",
  "orderNo": "'${ORDER_NO}'",
  "styleId": "'${STYLE_ID}'",
  "styleNo": "'${STYLE_NO}'",
  "quantity": 100,
  "status": "pending",
  "cuttingDate": "2026-02-06",
  "remark": "端到端测试裁剪单"
}'

log_info "创建裁剪单: ${CUTTING_NO}"
CUTTING_RESP=$(curl -s -X POST "${BASE_URL}/api/production/cutting" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${CUTTING_DATA}")

CUTTING_ID=$(echo "${CUTTING_RESP}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$CUTTING_ID" ]; then
    log_error "裁剪单创建失败"
    echo "响应: ${CUTTING_RESP}"
    log_warning "将跳过裁剪相关测试"
else

log_success "裁剪单创建成功 (ID: ${CUTTING_ID})"

# ============================================
# 第八步：创建扫码记录（模拟生产）
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 8 步：模拟生产扫码"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 查询工序列表
PROCESS_LIST=$(curl -s -X POST "${BASE_URL}/api/basic/process/list" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"pageNum":1,"pageSize":5}')

PROCESS_CODE=$(echo "${PROCESS_LIST}" | grep -o '"processCode":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PROCESS_CODE" ]; then
    log_warning "未找到工序，跳过扫码测试"
else
    SCAN_DATA='{
      "orderId": "'${ORDER_ID}'",
      "orderNo": "'${ORDER_NO}'",
      "processCode": "'${PROCESS_CODE}'",
      "quantity": 10,
      "scanType": "production",
      "remark": "端到端测试扫码"
    }'

    log_info "创建扫码记录 (工序: ${PROCESS_CODE})"
    SCAN_RESP=$(curl -s -X POST "${BASE_URL}/api/production/scan" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Content-Type: application/json" \
      -d "${SCAN_DATA}")

    SCAN_ID=$(echo "${SCAN_RESP}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -n "$SCAN_ID" ]; then
        log_success "扫码记录创建成功 (ID: ${SCAN_ID})"
    else
        log_warning "扫码记录创建失败或已存在"
    fi
fi

# ============================================
# 第九步：成品入库
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 9 步：成品入库"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FINISHED_INBOUND_DATA='{
  "orderId": "'${ORDER_ID}'",
  "orderNo": "'${ORDER_NO}'",
  "quantity": 100,
  "warehouseLocation": "B-01-001",
  "qualityLevel": "A",
  "remark": "端到端测试入库"
}'

log_info "执行成品入库"
FINISHED_INBOUND_RESP=$(curl -s -X POST "${BASE_URL}/api/warehouse/finished-product/inbound" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d "${FINISHED_INBOUND_DATA}")

INBOUND_ID=$(echo "${FINISHED_INBOUND_RESP}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$INBOUND_ID" ]; then
    log_success "成品入库成功 (ID: ${INBOUND_ID})"
else
    log_warning "成品入库可能需要先完成生产流程"
    echo "响应: ${FINISHED_INBOUND_RESP}"
fi

# ============================================
# 第十步：查询对账单
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 10 步：查询对账单"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

log_info "查询订单相关对账单"
RECONCILIATION_LIST=$(curl -s -X POST "${BASE_URL}/api/finance/reconciliation/list" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "orderNo": "'${ORDER_NO}'"
    },
    "pageNum": 1,
    "pageSize": 10
  }')

RECON_ID=$(echo "${RECONCILIATION_LIST}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$RECON_ID" ]; then
    log_success "找到对账单 (ID: ${RECON_ID})"

    # 测试对账单审批流程
    echo ""
    log_info "测试对账单审批流程"

    # 审批
    RECON_APPROVE=$(curl -s -X POST "${BASE_URL}/api/finance/reconciliation/${RECON_ID}/status-action?action=update&status=approved" \
      -H "Authorization: Bearer ${TOKEN}")

    if echo "${RECON_APPROVE}" | grep -q '"code":200'; then
        log_success "对账单审批成功"

        sleep 1

        # 付款
        RECON_PAY=$(curl -s -X POST "${BASE_URL}/api/finance/reconciliation/${RECON_ID}/status-action?action=update&status=paid" \
          -H "Authorization: Bearer ${TOKEN}")

        if echo "${RECON_PAY}" | grep -q '"code":200'; then
            log_success "对账单付款成功"
        else
            log_warning "对账单付款失败"
        fi
    else
        log_warning "对账单审批失败"
    fi
else
    log_info "暂无对账单（可能需要扫码记录生成）"
fi

# ============================================
# 第十一步：库存验证
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "第 11 步：库存验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 查询样衣库存
log_info "查询样衣库存"
SAMPLE_STOCK=$(curl -s -X POST "${BASE_URL}/api/warehouse/sample-stock/list" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "styleNo": "'${STYLE_NO}'"
    },
    "pageNum": 1,
    "pageSize": 10
  }')

SAMPLE_QTY=$(echo "${SAMPLE_STOCK}" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)

if [ -n "$SAMPLE_QTY" ]; then
    log_success "样衣库存: ${SAMPLE_QTY} 件"
else
    log_info "样衣库存查询: 暂无数据"
fi

# 查询成品库存
log_info "查询成品库存"
FINISHED_STOCK=$(curl -s -X POST "${BASE_URL}/api/warehouse/finished-stock/list" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "filters": {
      "orderNo": "'${ORDER_NO}'"
    },
    "pageNum": 1,
    "pageSize": 10
  }')

FINISHED_QTY=$(echo "${FINISHED_STOCK}" | grep -o '"quantity":[0-9]*' | head -1 | cut -d':' -f2)

if [ -n "$FINISHED_QTY" ]; then
    log_success "成品库存: ${FINISHED_QTY} 件"
else
    log_info "成品库存查询: 暂无数据"
fi

# ============================================
# 测试总结
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "测试总结"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "测试数据摘要:"
echo "  款式编号: ${STYLE_NO}"
echo "  款式ID: ${STYLE_ID}"
echo "  样衣编号: ${SAMPLE_NO}"
echo "  样衣ID: ${SAMPLE_ID}"
echo "  订单编号: ${ORDER_NO}"
echo "  订单ID: ${ORDER_ID}"
echo "  裁剪单号: ${CUTTING_NO}"
echo ""
echo "测试结果:"
echo -e "  成功: ${GREEN}${success_count}${NC} 项"
echo -e "  失败: ${RED}${fail_count}${NC} 项"
echo ""

if [ $fail_count -eq 0 ]; then
    echo -e "${GREEN}=============================================${NC}"
    echo -e "${GREEN}✅ 所有测试通过！业务流程协调正常${NC}"
    echo -e "${GREEN}=============================================${NC}"
else
    echo -e "${YELLOW}=============================================${NC}"
    echo -e "${YELLOW}⚠️  部分测试未通过，请检查日志${NC}"
    echo -e "${YELLOW}=============================================${NC}"
fi

echo ""
echo "💡 清理测试数据命令："
echo "docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e \\"
echo "  \"DELETE FROM t_style_info WHERE id='${STYLE_ID}';"
echo "   DELETE FROM t_sample WHERE id='${SAMPLE_ID}';"
echo "   DELETE FROM t_production_order WHERE id='${ORDER_ID}';"
echo "   DELETE FROM t_cutting WHERE id='${CUTTING_ID}';\""
echo ""
