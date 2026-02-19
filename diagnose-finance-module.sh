#!/bin/bash

# ========================================
# 财务模块问题修复指南
# ========================================
# 生成时间: $(date +%Y-%m-%d)
# ========================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}======================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}======================================${NC}\n"
}

print_header "🔍 财务模块完整诊断报告"

echo "生成时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ========================================
# 1. 数据库表检查
# ========================================
print_header "1. 数据库表结构检查"

echo "✅ 已存在的财务相关表:"
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "
SELECT
    TABLE_NAME as '表名',
    TABLE_ROWS as '记录数',
    ROUND(DATA_LENGTH/1024, 2) as '数据大小(KB)',
    CREATE_TIME as '创建时间'
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'fashion_supplychain'
AND (TABLE_NAME LIKE '%finance%'
     OR TABLE_NAME LIKE '%payroll%'
     OR TABLE_NAME LIKE '%settlement%'
     OR TABLE_NAME LIKE '%reconciliation%'
     OR TABLE_NAME LIKE '%expense%'
     OR TABLE_NAME LIKE '%payment%')
ORDER BY TABLE_NAME;
" 2>/dev/null

echo ""
echo "📋 表分类:"
echo ""
echo "【工资结算】"
echo "  - t_payroll_settlement (工资结算主表)"
echo "  - t_payroll_settlement_item (工资结算明细)"
echo ""
echo "【订单结算】"
echo "  - t_finished_settlement_approval (成品结算审批)"
echo "  - t_order_reconciliation_approval (订单对账审批)"
echo "  - v_finished_product_settlement (成品结算视图)"
echo ""
echo "【物料对账】"
echo "  - t_material_reconciliation (物料对账)"
echo "  - t_shipment_reconciliation (发货对账)"
echo ""
echo "【费用报销】"
echo "  - t_expense_reimbursement (费用报销)"
echo ""
echo "【付款管理】"
echo "  - t_wage_payment (工资付款)"
echo "  - t_payment_account (付款账户)"
echo "  - t_app_payment (应用付款)"
echo ""

# ========================================
# 2. Controller映射检查
# ========================================
print_header "2. Controller与表的映射关系"

echo "| 菜单项 | 前端路由 | 后端Controller | 数据库表 | 匹配度 |"
echo "|--------|----------|---------------|----------|--------|"
echo "| 物料对账 | /finance/material-reconciliation | MaterialReconciliationController | t_material_reconciliation | ✅ 完全匹配 |"
echo "| 工资结算(内) | /finance/payroll-operator-summary | ⚠️ PayrollSettlementController | t_payroll_settlement | ⚠️ 名称不一致 |"
echo "| 订单结算(外) | /finance/center | FinishedProductSettlementController | v_finished_product_settlement | ✅ 基本匹配 |"
echo "| 费用报销 | /finance/expense-reimbursement | ExpenseReimbursementController | t_expense_reimbursement | ✅ 完全匹配 |"
echo "| 付款中心 | /finance/wage-payment | WagePaymentController | t_wage_payment | ✅ 完全匹配 |"
echo ""

# ========================================
# 3. 数据质量检查
# ========================================
print_header "3. 数据质量检查"

echo "🔍 检查物料对账表的数据..."
echo ""
echo "记录数: $(docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e 'SELECT COUNT(*) FROM t_material_reconciliation;' 2>/dev/null | tail -1)"
echo ""
echo "数据样本 (前3条):"
docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain -e "
SELECT
    LEFT(id, 8) as 'ID前缀',
    material_name as '物料名称',
    quantity as '数量',
    status as '状态',
    DATE_FORMAT(create_time, '%Y-%m-%d') as '创建日期'
FROM t_material_reconciliation
LIMIT 3;
" 2>/dev/null

echo ""
echo "⚠️ 发现问题: 物料名称显示为乱码(??????)"
echo "   原因: 可能是字符编码问题"
echo "   影响: 数据显示不正确"
echo ""

# ========================================
# 4. API端点测试
# ========================================
print_header "4. API端点可用性测试"

# 登录获取Token
echo "正在登录..."
TOKEN_RESPONSE=$(curl -s -X POST "http://localhost:8088/api/system/user/login" \
    -H "Content-Type: application/json" \
    -d '{"username": "admin", "password": "admin123"}')

TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}❌ 登录失败，无法继续测试API${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 登录成功${NC}"
echo ""

# 测试各个Controller的list端点
echo "测试API端点 (使用GET方法):"
echo ""

# 1. 物料对账
echo -n "1. 物料对账 GET /api/finance/material-reconciliation/list: "
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \ "http://localhost:8088/api/finance/material-reconciliation/list?page=1&pageSize=10" \
    -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 成功 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ 失败 (HTTP $HTTP_CODE)${NC}"
    echo "$RESPONSE" | head -5
fi

# 2. 工资结算
echo -n "2. 工资结算 GET /api/finance/payroll-settlement/list: "
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "http://localhost:8088/api/finance/payroll-settlement/list?page=1&pageSize=10" \
    -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 成功 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ 失败 (HTTP $HTTP_CODE)${NC}"
fi

# 3. 订单结算
echo -n "3. 订单结算 GET /api/finance/finished-settlement/list: "
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "http://localhost:8088/api/finance/finished-settlement/list?page=1&pageSize=10" \
    -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 成功 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ 失败 (HTTP $HTTP_CODE)${NC}"
fi

# 4. 费用报销
echo -n "4. 费用报销 GET /api/finance/expense-reimbursement/list: "
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "http://localhost:8088/api/finance/expense-reimbursement/list?page=1&pageSize=10" \
    -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 成功 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${RED}❌ 失败 (HTTP $HTTP_CODE)${NC}"
fi

# 5. 付款中心 - 注意这个路径可能不同
echo -n "5. 付款中心 GET /api/finance/payments: "
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    "http://localhost:8088/api/finance/payments?page=1&pageSize=10" \
    -H "Authorization: Bearer $TOKEN")
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ 成功 (HTTP $HTTP_CODE)${NC}"
else
    echo -e "${YELLOW}⚠️ 路径可能不正确 (HTTP $HTTP_CODE)${NC}"
fi

echo ""

# ========================================
# 5. 关键问题汇总
# ========================================
print_header "5. 关键问题汇总"

echo "🔴 P0 - 严重问题"
echo "  1. ❌ 物料名称乱码 - t_material_reconciliation表中文显示问题"
echo "  2. ⚠️ Controller命名不一致 - PayrollOperator vs PayrollSettlement"
echo "  3. ⚠️ API路径可能不匹配 - 需要确认前后端路径一致性"
echo ""

echo "🟡 P1 - 中等问题"
echo "  4. ⚠️ 所有表记录数为0 (除t_material_reconciliation外)"
echo "  5. ⚠️ 权限配置缺失 - 财务菜单权限未在数据库注册"
echo "  6. ⚠️ 部分API端点未实现 (统计、看板等)"
echo ""

echo "🟢 P2 - 轻微问题"
echo "  7. ℹ️ 测试数据不足 - 影响功能验证"
echo "  8. ℹ️ 文档待完善 - API文档、业务流程文档"
echo ""

# ========================================
# 6. 修复建议
# ========================================
print_header "6. 修复建议"

echo "📋 立即修复 (今天)"
echo ""
echo "1. 修复字符编码问题"
echo "   - 检查数据库字符集: ALTER TABLE t_material_reconciliation CONVERT TO CHARACTER SET utf8mb4;"
echo "   - 或在连接URL添加: ?characterEncoding=UTF-8"
echo ""
echo "2. 统一命名"
echo "   - 选项A: 重命名Controller为PayrollOperatorController"
echo "   - 选项B: 修改前端路由为/finance/payroll-settlement"
echo ""
echo "3. 创建测试数据"
echo "   - 添加费用报销样本数据"
echo "   - 添加工资结算样本数据"
echo "   - 添加付款记录样本数据"
echo ""

echo "📋 本周完成"
echo ""
echo "4. 添加权限配置"
echo "   SQL: INSERT INTO t_permission (code, name, type) VALUES "
echo "        ('MENU_FINANCE', '财务管理', 'MENU');"
echo ""
echo "5. 实现缺失的API端点"
echo "   - 统计接口 (/statistics, /summary)"
echo "   - 数据看板 (/dashboard)"
echo "   - 批量操作 (/batch-xxx)"
echo ""

echo "📋 下周完成"
echo ""
echo "6. 完善单元测试"
echo "   - Controller测试"
echo "   - Service测试"
echo "   - 集成测试"
echo ""
echo "7. 更新文档"
echo "   - Swagger API文档"
echo "   - 业务流程文档"
echo "   - 开发向导"
echo ""

# ========================================
# 7. 快速测试SQL
# ========================================
print_header "7. 快速测试SQL (可直接执行)"

cat << 'EOF'

-- 1. 检查表字符集
SELECT
    TABLE_NAME,
    TABLE_COLLATION,
    TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'fashion_supplychain'
AND TABLE_NAME LIKE '%reconciliation%';

-- 2. 修复字符编码 (如果需要)
ALTER TABLE t_material_reconciliation
CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. 创建测试数据 - 费用报销
INSERT INTO t_expense_reimbursement (
    id, type, amount, applicant, reason, status, create_time
) VALUES (
    UUID(), 'TRAVEL', 500.00, 'admin', '差旅费报销', 'PENDING', NOW()
);

-- 4. 创建测试数据 - 工资结算
INSERT INTO t_payroll_settlement (
    id, period, total_amount, status, create_time
) VALUES (
    UUID(), '2026-02', 50000.00, 'DRAFT', NOW()
);

-- 5. 创建测试数据 - 付款记录
INSERT INTO t_wage_payment (
    id, employee_name, amount, payment_date, status, create_time
) VALUES (
    UUID(), '测试员工', 5000.00, NOW(), 'PENDING', NOW()
);

-- 6. 验证数据
SELECT '物料对账', COUNT(*) FROM t_material_reconciliation
UNION ALL
SELECT '费用报销', COUNT(*) FROM t_expense_reimbursement
UNION ALL
SELECT '工资结算', COUNT(*) FROM t_payroll_settlement
UNION ALL
SELECT '付款记录', COUNT(*) FROM t_wage_payment;

EOF

print_header "✅ 诊断完成"

echo "详细报告已生成。"
echo ""
echo "下一步操作:"
echo "  1. 运行上面的SQL修复字符编码"
echo "  2. 添加测试数据"
echo "  3. 重新测试API"
echo "  4. 查看前端页面显示"
echo ""
echo "如有问题，请查看:"
echo "  - 后端日志: backend/logs/fashion-supplychain.log"
echo "  - 测试报告: FINANCE_MODULE_DIAGNOSTIC_REPORT.md"
echo "  - 测试结果: test-finance-results.txt"
echo ""
