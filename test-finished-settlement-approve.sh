#!/bin/bash

# 成品结算审批API测试脚本
# 2026-01-28

echo "========================================="
echo "成品结算审批API测试"
echo "========================================="

# 设置环境变量
BASE_URL="http://localhost:8080"
API_PATH="/api/finance/finished-settlement"

echo ""
echo "测试前置条件："
echo "1. 后端服务已启动（端口8080）"
echo "2. 已有成品结算数据"
echo "3. 已配置FINANCE_SETTLEMENT_APPROVE权限"
echo ""

# 1. 测试无权限访问（应返回403）
echo "【测试1】无权限访问审批接口"
echo "curl -X POST ${BASE_URL}${API_PATH}/approve ..."
curl -X POST "${BASE_URL}${API_PATH}/approve" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-order-id"}' \
  -w "\nHTTP状态码: %{http_code}\n" \
  -s | jq . || echo "（预期返回403或401）"
echo ""

# 2. 测试缺少ID参数
echo "【测试2】缺少ID参数"
echo "预期返回失败消息：订单ID不能为空"
echo ""

# 3. 测试不存在的订单ID
echo "【测试3】不存在的订单ID"
echo "预期返回失败消息：未找到该订单的结算数据"
echo ""

# 4. 测试正常审批
echo "【测试4】正常审批流程"
echo "需要："
echo "  - 有效的JWT Token"
echo "  - 真实的订单ID"
echo "  - FINANCE_SETTLEMENT_APPROVE权限"
echo ""

echo "========================================="
echo "API接口信息"
echo "========================================="
echo "审批接口："
echo "  POST ${API_PATH}/approve"
echo "  Body: { \"id\": \"订单ID\" }"
echo ""
echo "查询审批状态："
echo "  GET ${API_PATH}/approval-status/{id}"
echo ""
echo "权限要求："
echo "  - 查看权限：FINANCE_SETTLEMENT_VIEW"
echo "  - 审批权限：FINANCE_SETTLEMENT_APPROVE"
echo ""

echo "========================================="
echo "数据库权限配置"
echo "========================================="
echo "执行以下SQL添加权限："
echo "  mysql -u root -p fashion_supplychain < scripts/add_finished_settlement_permissions.sql"
echo ""
echo "验证权限："
echo "  SELECT * FROM t_permission WHERE permission_code LIKE '%SETTLEMENT%';"
echo "  SELECT * FROM t_role_permission rp"
echo "    JOIN t_permission p ON rp.permission_id = p.id"
echo "    WHERE p.permission_code IN ('FINANCE_SETTLEMENT_VIEW', 'FINANCE_SETTLEMENT_APPROVE');"
echo ""

echo "========================================="
echo "前端调用示例"
echo "========================================="
echo "文件：frontend/src/modules/finance/pages/FinanceCenter/FinishedSettlementContent.tsx"
echo ""
echo "调用代码："
echo "  await api.post('/api/finance/finished-settlement/approve', {"
echo "    id: currentRecord.orderId"
echo "  });"
echo ""

echo "========================================="
echo "测试完成说明"
echo "========================================="
echo ""
echo "✅ 已完成："
echo "  1. 后端API实现（FinishedProductSettlementController.approve）"
echo "  2. 前端调用更新（FinishedSettlementContent.tsx）"
echo "  3. 权限配置SQL（add_finished_settlement_permissions.sql）"
echo ""
echo "⏸️ 待执行："
echo "  1. 运行权限SQL脚本"
echo "  2. 重启后端服务"
echo "  3. 前端测试审批流程"
echo ""
echo "📝 注意事项："
echo "  - 当前审批状态存储在内存中（approvalStatus Map）"
echo "  - 生产环境应持久化到数据库（建议添加approval_status字段）"
echo "  - 需要管理员角色或具有FINANCE_SETTLEMENT_APPROVE权限"
echo ""
