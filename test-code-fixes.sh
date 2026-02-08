#!/bin/bash

# 验证代码修复 - 不依赖后端API
# 2026-02-06

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_test() {
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo -ne "${YELLOW}[$TOTAL_TESTS]${NC} $1 ... "
}

print_pass() {
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
}

print_fail() {
    echo -e "${RED}❌ FAIL${NC}"
    if [ -n "$1" ]; then
        echo -e "   ${RED}原因: $1${NC}"
    fi
    FAILED_TESTS=$((FAILED_TESTS + 1))
}

print_info() {
    echo -e "${BLUE}   ℹ️  $1${NC}"
}

# ============================================
# 开始测试
# ============================================
print_header "代码修复验证测试"
echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ============================================
# C1. 成品库存Mock数据替换
# ============================================
print_header "C1. 成品库存API集成"

print_test "检查warehouseApi.ts是否存在"
if [ -f "frontend/src/services/warehouse/warehouseApi.ts" ]; then
    print_pass
    print_info "$(wc -l < frontend/src/services/warehouse/warehouseApi.ts) 行代码"
else
    print_fail "文件不存在"
fi

print_test "检查FinishedInventory是否移除Mock数据"
if ! grep -q "getMockData" frontend/src/modules/warehouse/pages/FinishedInventory/index.tsx; then
    print_pass
else
    print_fail "仍包含getMockData函数"
fi

print_test "检查FinishedInventory是否使用API"
if grep -q "finishedInventoryApi" frontend/src/modules/warehouse/pages/FinishedInventory/index.tsx; then
    print_pass
else
    print_fail "未使用finishedInventoryApi"
fi

print_test "检查loading状态管理"
if grep -q "loading" frontend/src/modules/warehouse/pages/FinishedInventory/index.tsx && \
   grep -q "setLoading" frontend/src/modules/warehouse/pages/FinishedInventory/index.tsx; then
    print_pass
else
    print_fail "缺少loading状态"
fi

# ============================================
# C2. 工资结算后端API
# ============================================
print_header "C2. 工资结算后端API"

print_test "检查payrollApi.ts是否存在"
if [ -f "frontend/src/services/finance/payrollApi.ts" ]; then
    print_pass
else
    print_fail "文件不存在"
fi

print_test "检查approve API方法"
if grep -q "approve.*(" frontend/src/services/finance/payrollApi.ts; then
    print_pass
else
    print_fail "缺少approve方法"
fi

print_test "检查reject API方法"
if grep -q "reject.*(" frontend/src/services/finance/payrollApi.ts; then
    print_pass
else
    print_fail "缺少reject方法"
fi

print_test "检查payment API方法"
if grep -q "payment.*(" frontend/src/services/finance/payrollApi.ts; then
    print_pass
else
    print_fail "缺少payment方法"
fi

print_test "检查PayrollOperatorSummary使用API"
if grep -q "payrollApi" frontend/src/modules/finance/pages/Finance/PayrollOperatorSummary/index.tsx; then
    print_pass
else
    print_fail "未使用payrollApi"
fi

# ============================================
# C3. 扫码撤销错误提示
# ============================================
print_header "C3. 扫码撤销错误提示"

print_test "检查撤销错误提示消息"
if grep -q "toast.error.*撤销失败.*未找到扫码记录信息" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "未添加错误提示"
fi

print_test "检查错误提示位置正确"
if grep -B5 "toast.error.*撤销失败" miniprogram/pages/scan/index.js | grep -q "if (!record || !recordId)"; then
    print_pass
else
    print_fail "错误提示位置不正确"
fi

# ============================================
# H1. 进度计算精度
# ============================================
print_header "H1. 进度计算精度修复"

print_test "检查Math.min(100, ...)修复"
if grep -q "Math\.min(100.*Math\.round" frontend/src/modules/production/pages/Production/ProgressDetail/index.tsx; then
    print_pass
else
    print_fail "未添加100%上限"
fi

print_test "检查完整的百分比计算"
if grep -q "percent.*Math\.min(100" frontend/src/modules/production/pages/Production/ProgressDetail/index.tsx; then
    print_pass
else
    print_fail "percent计算未修复"
fi

# ============================================
# H2. 审批金额校验
# ============================================
print_header "H2. 审批金额校验"

print_test "检查金额阈值常量定义"
if grep -q "APPROVAL_AMOUNT_LIMITS" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "未定义金额阈值"
fi

print_test "检查NORMAL限额(10000)"
if grep -q "NORMAL.*10000" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "NORMAL限额不正确"
fi

print_test "检查MANAGER限额(50000)"
if grep -q "MANAGER.*50000" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "MANAGER限额不正确"
fi

print_test "检查DIRECTOR限额(100000)"
if grep -q "DIRECTOR.*100000" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "DIRECTOR限额不正确"
fi

print_test "检查备注必填金额阈值"
if grep -q "REMARK_REQUIRED_AMOUNT.*10000" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "未定义备注必填阈值"
fi

print_test "检查金额权限验证逻辑"
if grep -q "amount > userMaxAmount" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "缺少权限验证"
fi

print_test "检查大额审批Modal"
if grep -q "大额审批确认" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "缺少大额审批确认"
fi

print_test "检查备注输入框"
if grep -q "approval-remark" frontend/src/modules/finance/pages/Finance/OrderReconciliationApproval/index.tsx; then
    print_pass
else
    print_fail "缺少备注输入框"
fi

# ============================================
# H3. 采购70%规则提示优化
# ============================================
print_header "H3. 采购70%规则提示优化"

print_test "检查优化的错误提示"
if grep -q "到货不足提醒" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "未优化错误提示"
fi

print_test "检查采购数量显示"
if grep -q "采购数量：" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "缺少采购数量显示"
fi

print_test "检查实际到货显示"
if grep -q "实际到货：" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "缺少实际到货显示"
fi

print_test "检查还需到货计算"
if grep -q "还需到货：" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "缺少还需到货计算"
fi

print_test "检查到货率计算"
if grep -q "arrivalRate.*toFixed" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "缺少到货率计算"
fi

# ============================================
# H6. 质检图片上传
# ============================================
print_header "H6. 质检图片上传"

print_test "检查uploadFile函数"
if grep -q "function uploadFile" miniprogram/utils/request.js; then
    print_pass
else
    print_fail "未添加uploadFile函数"
fi

print_test "检查wx.uploadFile调用"
if grep -q "wx\.uploadFile" miniprogram/utils/request.js; then
    print_pass
else
    print_fail "uploadFile未使用wx.uploadFile"
fi

print_test "检查uploadFile导出"
if grep -q "export.*uploadFile" miniprogram/utils/request.js; then
    print_pass
else
    print_fail "uploadFile未导出"
fi

print_test "检查common API模块"
if grep -q "const common.*=" miniprogram/utils/api.js && grep -q "uploadImage" miniprogram/utils/api.js; then
    print_pass
else
    print_fail "未添加common模块"
fi

print_test "检查common.uploadImage方法"
if grep -A10 "const common" miniprogram/utils/api.js | grep -q "uploadImage.*filePath"; then
    print_pass
else
    print_fail "uploadImage方法定义不正确"
fi

print_test "检查quality页面使用uploadImage"
if grep -q "api\.common\.uploadImage" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "质检页面未使用uploadImage"
fi

print_test "检查Promise.all批量上传"
if grep -q "Promise\.all.*uploadImage" miniprogram/pages/scan/index.js; then
    print_pass
else
    print_fail "未实现批量上传"
fi

print_test "检查上传进度提示"
if grep -A5 -B5 "api\.common\.uploadImage" miniprogram/pages/scan/index.js | grep -q "wx\.showLoading"; then
    print_pass
else
    print_fail "缺少上传进度提示"
fi

# ============================================
# H9. 仪表板错误降级
# ============================================
print_header "H9. 仪表板错误降级"

print_test "检查hasError状态"
if grep -q "hasError" frontend/src/modules/dashboard/pages/Dashboard/index.tsx; then
    print_pass
else
    print_fail "未添加hasError状态"
fi

print_test "检查errorMessage状态"
if grep -q "errorMessage" frontend/src/modules/dashboard/pages/Dashboard/index.tsx; then
    print_pass
else
    print_fail "未添加errorMessage状态"
fi

print_test "检查retryCount状态"
if grep -q "retryCount" frontend/src/modules/dashboard/pages/Dashboard/index.tsx; then
    print_pass
else
    print_fail "未添加retryCount状态"
fi

print_test "检查handleRetry函数"
if grep -q "handleRetry" frontend/src/modules/dashboard/pages/Dashboard/index.tsx; then
    print_pass
else
    print_fail "未添加handleRetry函数"
fi

print_test "检查错误时数据保留"
if grep -A10 "catch.*error" frontend/src/modules/dashboard/pages/Dashboard/index.tsx | grep -q "setHasError(true)"; then
    print_pass
else
    print_fail "错误处理不正确"
fi

print_test "检查错误横幅UI"
if grep -q "hasError.*&&" frontend/src/modules/dashboard/pages/Dashboard/index.tsx && \
   grep -q "重试" frontend/src/modules/dashboard/pages/Dashboard/index.tsx; then
    print_pass
else
    print_fail "未添加错误横幅UI"
fi

# ============================================
# 测试总结
# ============================================
print_header "测试总结"

echo -e "总测试数: ${BLUE}$TOTAL_TESTS${NC}"
echo -e "通过: ${GREEN}$PASSED_TESTS${NC}"
echo -e "失败: ${RED}$FAILED_TESTS${NC}"

SUCCESS_RATE=$(awk "BEGIN {printf \"%.1f\", ($PASSED_TESTS/$TOTAL_TESTS)*100}")
echo -e "通过率: ${BLUE}${SUCCESS_RATE}%${NC}\n"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✅ 所有代码修复验证通过！${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

    echo -e "${YELLOW}📝 后续验证步骤:${NC}"
    echo "1. 访问 http://localhost:5173 测试前端功能"
    echo "2. 测试成品库存（无Mock数据）"
    echo "3. 测试工资结算审批流程"
    echo "4. 测试大额审批（>10,000元）备注要求"
    echo "5. 小程序测试质检图片上传"
    echo "6. 小程序测试采购70%规则提示"
    echo "7. 仪表板错误降级测试（断网）"
    echo ""
    exit 0
elif [ $SUCCESS_RATE -ge 90 ]; then
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}⚠️  大部分修复验证通过，请检查失败项${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    exit 1
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}❌ 部分修复验证失败，需要检查${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    exit 1
fi
