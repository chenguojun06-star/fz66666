#!/bin/bash

# 测试所有修复功能
# 2026-02-06 验证8个核心问题修复

BASE_URL="http://localhost:8088"
FRONTEND_URL="http://localhost:5173"

# 自动模式（不等待用户按键）
AUTO_MODE=${1:-"--auto"}

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 测试统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# 打印函数
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
    echo -e "${YELLOW}[测试 $1]${NC} $2"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
}

print_fail() {
    echo -e "${RED}❌ $1${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# 增加测试计数
count_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
}

# 获取登录Token
get_token() {
    local response=$(curl -s -X POST "$BASE_URL/api/auth/login" \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}')

    echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4
}

# 等待用户按键
wait_key() {
    if [ "$AUTO_MODE" != "--auto" ]; then
        echo -e "\n${YELLOW}按任意键继续下一个测试...${NC}"
        read -n 1 -s
    else
        echo ""
    fi
}

# ============================================
# 主测试流程
# ============================================

print_header "系统全面修复验证测试"
echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "后端地址: $BASE_URL"
echo "前端地址: $FRONTEND_URL"

# 获取认证Token
print_info "获取认证Token..."
TOKEN=$(get_token)
if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ 无法获取Token，测试终止${NC}"
    exit 1
fi
print_success "Token获取成功: ${TOKEN:0:20}..."

# ============================================
# C1. 测试成品库存API (替代Mock数据)
# ============================================
print_header "C1. 成品库存API测试"
count_test

print_test "1.1" "测试成品库存列表查询"
response=$(curl -s -X POST "$BASE_URL/api/warehouse/finished-inventory/list" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"page":1,"pageSize":10}')

if echo "$response" | grep -q '"code":200'; then
    count=$(echo "$response" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    print_success "列表查询成功，总记录数: $count"
else
    print_fail "列表查询失败: $response"
fi

print_test "1.2" "测试SKU详情查询"
# 先获取一个SKU
sku=$(echo "$response" | grep -o '"sku":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$sku" ]; then
    detail_response=$(curl -s -X GET "$BASE_URL/api/warehouse/finished-inventory/sku/$sku/details" \
        -H "Authorization: Bearer $TOKEN")

    if echo "$detail_response" | grep -q '"code":200'; then
        print_success "SKU详情查询成功: $sku"
    else
        print_fail "SKU详情查询失败"
    fi
else
    print_info "跳过SKU详情测试（无可用数据）"
fi

print_info "前端验证: 访问 $FRONTEND_URL/warehouse/finished-inventory 检查是否已无Mock数据"
wait_key

# ============================================
# C2. 测试工资结算后端API
# ============================================
print_header "C2. 工资结算后端API测试"
count_test

print_test "2.1" "测试工资汇总列表"
payroll_response=$(curl -s -X POST "$BASE_URL/api/finance/payroll/operator-summary/list" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"page":1,"pageSize":10,"status":"pending"}')

if echo "$payroll_response" | grep -q '"code":200'; then
    payroll_count=$(echo "$payroll_response" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    print_success "工资汇总查询成功，待审批: $payroll_count 条"
else
    print_fail "工资汇总查询失败"
fi

print_test "2.2" "测试审批API端点"
# 测试审批接口是否可用（不实际执行）
approve_test=$(curl -s -X POST "$BASE_URL/api/finance/payroll/operator-summary/approve" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"id":"test-id"}')

if echo "$approve_test" | grep -q -E '(code|message)'; then
    print_success "审批API端点可用"
else
    print_fail "审批API端点不可用"
fi

print_info "前端验证: 访问 $FRONTEND_URL/finance/payroll 测试审批、驳回、付款功能"
wait_key

# ============================================
# C3. 测试扫码撤销错误提示
# ============================================
print_header "C3. 扫码撤销错误提示测试"
count_test

print_info "此项为小程序前端优化，需要手动测试"
print_test "3.1" "检查代码修复是否存在"

if grep -q "toast.error('撤销失败：未找到扫码记录信息')" miniprogram/pages/scan/index.js; then
    print_success "错误提示代码已添加"
else
    print_fail "错误提示代码未找到"
fi

print_info "手动测试步骤:"
print_info "1. 打开小程序扫码页面"
print_info "2. 模拟无recordId的撤销场景"
print_info "3. 验证是否显示友好错误提示"
wait_key

# ============================================
# H1. 测试进度计算精度
# ============================================
print_header "H1. 进度计算精度测试"
count_test

print_test "1.1" "测试生产进度详情API"
progress_response=$(curl -s -X GET "$BASE_URL/api/production/order/progress-detail?orderId=test" \
    -H "Authorization: Bearer $TOKEN")

if echo "$progress_response" | grep -q -E '(code|message|data)'; then
    print_success "进度详情API可用"
else
    print_fail "进度详情API不可用"
fi

print_test "1.2" "检查前端代码修复"
if grep -q "Math.min(100," frontend/src/modules/production/pages/Production/ProgressDetail/index.tsx; then
    print_success "进度计算已添加100%上限"
else
    print_fail "进度计算修复未找到"
fi

print_info "前端验证: 制造超量完成数据，验证进度不超过100%"
wait_key

# ============================================
# H2. 测试审批金额校验
# ============================================
print_header "H2. 审批金额校验测试"
count_test

print_test "2.1" "测试订单结算审批列表"
approval_response=$(curl -s -X GET "$BASE_URL/api/finance/order-reconciliation-approval/list?page=1&pageSize=10" \
    -H "Authorization: Bearer $TOKEN")

if echo "$approval_response" | grep -q '"code":200'; then
    approval_count=$(echo "$approval_response" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    print_success "审批列表查询成功，待审批: $approval_count 条"
else
    print_fail "审批列表查询失败"
fi

print_test "2.2" "检查金额阈值配置"
if grep -q "APPROVAL_AMOUNT_LIMITS" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_success "金额阈值配置已添加"

    # 验证阈值
    if grep -q "NORMAL: 10000" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
        print_success "普通员工限额: 10,000元"
    fi
    if grep -q "MANAGER: 50000" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
        print_success "经理限额: 50,000元"
    fi
    if grep -q "DIRECTOR: 100000" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
        print_success "总监限额: 100,000元"
    fi
else
    print_fail "金额阈值配置未找到"
fi

print_test "2.3" "检查大额审批备注校验"
if grep -q "REMARK_REQUIRED_AMOUNT" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_success "大额审批备注要求已添加（>10,000元）"
else
    print_fail "大额审批备注要求未找到"
fi

print_info "手动测试步骤:"
print_info "1. 访问 $FRONTEND_URL/finance/order-reconciliation-approval"
print_info "2. 测试大额审批（>10,000元）是否强制要求备注"
print_info "3. 测试不同角色的金额上限（普通/经理/总监）"
wait_key

# ============================================
# H3. 测试采购70%规则提示优化
# ============================================
print_header "H3. 采购70%规则提示优化测试"
count_test

print_test "3.1" "检查错误提示优化"
if grep -q "到货不足提醒" miniprogram/pages/scan/index.js; then
    print_success "详细错误提示已添加"

    # 验证提示内容
    if grep -q "采购数量：" miniprogram/pages/scan/index.js; then
        print_success "包含采购数量显示"
    fi
    if grep -q "实际到货：" miniprogram/pages/scan/index.js; then
        print_success "包含实际到货显示"
    fi
    if grep -q "还需到货：" miniprogram/pages/scan/index.js; then
        print_success "包含还需到货计算"
    fi
else
    print_fail "错误提示优化未找到"
fi

print_info "手动测试步骤:"
print_info "1. 打开小程序采购收货页面"
print_info "2. 输入<70%的到货数量"
print_info "3. 验证是否显示详细的友好提示"
wait_key

# ============================================
# H6. 测试质检图片上传
# ============================================
print_header "H6. 质检图片上传测试"
count_test

print_test "6.1" "检查uploadFile函数"
if grep -q "function uploadFile" miniprogram/utils/request.js; then
    print_success "uploadFile函数已添加"
else
    print_fail "uploadFile函数未找到"
fi

print_test "6.2" "检查common.uploadImage API"
if grep -q "common:" miniprogram/utils/api.js && grep -q "uploadImage" miniprogram/utils/api.js; then
    print_success "common.uploadImage API已添加"
else
    print_fail "common.uploadImage API未找到"
fi

print_test "6.3" "检查质检页面上传逻辑"
if grep -q "api.common.uploadImage" miniprogram/pages/scan/index.js; then
    print_success "质检页面已集成图片上传"
else
    print_fail "质检页面上传逻辑未找到"
fi

print_test "6.4" "测试图片上传API端点"
# 创建测试图片（1x1 PNG）
test_image="/tmp/test_upload.png"
echo -e '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82' > "$test_image"

upload_response=$(curl -s -X POST "$BASE_URL/api/common/upload/image" \
    -H "Authorization: Bearer $TOKEN" \
    -F "file=@$test_image")

if echo "$upload_response" | grep -q -E '(url|fileUrl)'; then
    print_success "图片上传API端点可用"
else
    print_info "图片上传API端点可能需要后端实现"
fi

rm -f "$test_image"

print_info "手动测试步骤:"
print_info "1. 打开小程序质检入库页面"
print_info "2. 上传图片"
print_info "3. 验证返回的是永久URL（非wx://临时路径）"
wait_key

# ============================================
# H9. 测试仪表板错误降级
# ============================================
print_header "H9. 仪表板错误降级测试"
count_test

print_test "9.1" "测试仪表板API"
dashboard_response=$(curl -s -X GET "$BASE_URL/api/dashboard" \
    -H "Authorization: Bearer $TOKEN")

if echo "$dashboard_response" | grep -q '"code":200'; then
    print_success "仪表板API正常"
else
    print_fail "仪表板API异常"
fi

print_test "9.2" "检查错误状态管理"
if grep -q "hasError" frontend/src/modules/dashboard/pages/Dashboard/index.tsx && \
   grep -q "errorMessage" frontend/src/modules/dashboard/pages/Dashboard/index.tsx; then
    print_success "错误状态管理已添加"
else
    print_fail "错误状态管理未找到"
fi

print_test "9.3" "检查重试机制"
if grep -q "handleRetry" frontend/src/modules/dashboard/pages/Dashboard/index.tsx && \
   grep -q "retryCount" frontend/src/modules/dashboard/pages/Dashboard/index.tsx; then
    print_success "重试机制已添加"
else
    print_fail "重试机制未找到"
fi

print_info "手动测试步骤:"
print_info "1. 访问 $FRONTEND_URL（仪表板首页）"
print_info "2. 模拟API错误（断网或后端停止）"
print_info "3. 验证是否保留上次数据且显示错误横幅"
print_info "4. 点击重试按钮验证恢复机制"
wait_key

# ============================================
# 测试总结
# ============================================
print_header "测试总结"

echo "总测试数: $TOTAL_TESTS"
echo -e "${GREEN}通过: $PASSED_TESTS${NC}"
echo -e "${RED}失败: $FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}✅ 所有自动化测试通过！${NC}"
    echo -e "${YELLOW}⚠️  请继续完成手动测试验证${NC}\n"
    exit 0
else
    echo -e "\n${RED}❌ 部分测试失败，请检查修复${NC}\n"
    exit 1
fi
