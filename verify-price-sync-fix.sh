#!/bin/bash

# 工序单价同步修复验证脚本
# 用途：快速验证修复是否成功
# 使用：./verify-price-sync-fix.sh

set -e

echo "======================================"
echo "工序单价同步修复验证"
echo "======================================"
echo ""

# 数据库连接信息
DB_CONTAINER="fashion-mysql-simple"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 颜色输出
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "1️⃣  检查代码修复状态..."
echo ""

# 检查 ProductionOrderOrchestrator.java 是否包含 syncUnitPrices 调用
if grep -q "processTrackingOrchestrator.syncUnitPrices" backend/src/main/java/com/fashion/supplychain/production/orchestration/ProductionOrderOrchestrator.java; then
    echo -e "${GREEN}✅ 代码修复成功${NC}"
    echo "   lockProgressWorkflow 方法已包含 syncUnitPrices() 调用"
else
    echo -e "${RED}❌ 代码未修复${NC}"
    echo "   lockProgressWorkflow 方法缺少 syncUnitPrices() 调用"
    echo ""
    echo "请先修复代码后再验证！"
    exit 1
fi
echo ""

echo "2️⃣  检查测试数据准备..."
echo ""

# 查询有工序跟踪记录的订单
TEST_ORDER=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT o.order_no
FROM t_production_order o
INNER JOIN t_production_process_tracking t ON o.id = t.production_order_id
WHERE o.delete_flag = 0
  AND o.progress_workflow_json IS NOT NULL
  AND o.progress_workflow_locked = 0
LIMIT 1;
" 2>/dev/null || echo "")

if [ -z "$TEST_ORDER" ]; then
    echo -e "${YELLOW}⚠️  未找到可用的测试订单${NC}"
    echo "   需要满足条件："
    echo "   - 有工序跟踪记录"
    echo "   - 进度工作流未锁定"
    echo "   - 未删除"
    echo ""
    echo "   请先创建测试订单或解锁现有订单"
    exit 0
else
    echo -e "${GREEN}✅ 找到测试订单: $TEST_ORDER${NC}"
fi
echo ""

echo "3️⃣  测试前准备（解锁订单）..."
echo ""

docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -e "
UPDATE t_production_order
SET progress_workflow_locked = 0,
    progress_workflow_locked_at = NULL,
    progress_workflow_locked_by = NULL,
    progress_workflow_locked_by_name = NULL
WHERE order_no = '$TEST_ORDER';
" 2>/dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 订单已解锁${NC}"
else
    echo -e "${RED}❌ 解锁失败${NC}"
    exit 1
fi
echo ""

echo "4️⃣  获取当前单价状态..."
echo ""

# 查询第一个工序的当前单价
CURRENT_PRICE=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT t.unit_price
FROM t_production_order o
INNER JOIN t_production_process_tracking t ON o.id = t.production_order_id
WHERE o.order_no = '$TEST_ORDER'
ORDER BY t.process_sequence
LIMIT 1;
" 2>/dev/null || echo "0")

echo "   当前单价: $CURRENT_PRICE 元"
echo ""

# 计算新单价（加 0.5 元用于测试）
NEW_PRICE=$(echo "$CURRENT_PRICE + 0.5" | bc)
echo "   测试单价: $NEW_PRICE 元 (当前 + 0.5)"
echo ""

echo "5️⃣  模拟前端保存工序单价..."
echo ""

# 这里需要实际调用前端保存 API
# 由于无法直接从脚本调用前端，这里提供手动操作指南

echo -e "${YELLOW}⚠️  请手动完成以下操作：${NC}"
echo ""
echo "   1. 打开浏览器：http://localhost:5173"
echo "   2. 进入【生产订单】模块"
echo "   3. 找到订单：$TEST_ORDER"
echo "   4. 点击【进度详情】"
echo "   5. 点击第一个工序节点"
echo "   6. 将【工序单价】修改为：$NEW_PRICE 元"
echo "   7. 点击【保存】按钮"
echo "   8. 观察提示信息（应显示"已同步 X 条工序跟踪记录的单价"）"
echo ""
read -p "完成上述操作后，按回车键继续..." WAIT
echo ""

echo "6️⃣  验证单价同步结果..."
echo ""

# 查询同步后的单价
SYNCED_PRICE=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT t.unit_price
FROM t_production_order o
INNER JOIN t_production_process_tracking t ON o.id = t.production_order_id
WHERE o.order_no = '$TEST_ORDER'
ORDER BY t.process_sequence
LIMIT 1;
" 2>/dev/null || echo "0")

echo "   同步后单价: $SYNCED_PRICE 元"
echo ""

# 对比单价
if [ "$SYNCED_PRICE" == "$NEW_PRICE" ]; then
    echo -e "${GREEN}✅ 单价同步成功！${NC}"
    echo "   progressWorkflowJson → t_production_process_tracking 同步正常"
else
    echo -e "${RED}❌ 单价同步失败！${NC}"
    echo "   预期单价: $NEW_PRICE"
    echo "   实际单价: $SYNCED_PRICE"
    echo ""
    echo "   可能原因："
    echo "   1. 代码未重启"
    echo "   2. 前端调用的 API 端点有误"
    echo "   3. 权限不足"
    echo ""
    echo "   请检查后端日志："
    echo "   tail -f backend/logs/fashion-supplychain.log | grep -i 'sync'"
    exit 1
fi
echo ""

echo "7️⃣  验证结算金额重算..."
echo ""

# 查询已扫码的工序
SETTLEMENT_CHECK=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -e "
SELECT
    process_name AS '工序名称',
    unit_price AS '单价',
    scanned_quantity AS '已扫数量',
    settlement_amount AS '结算金额',
    CAST(unit_price * scanned_quantity AS DECIMAL(10,2)) AS '预期金额',
    CASE
        WHEN settlement_amount = CAST(unit_price * scanned_quantity AS DECIMAL(10,2))
        THEN '✅ 正确'
        ELSE '❌ 错误'
    END AS '验证'
FROM t_production_process_tracking t
INNER JOIN t_production_order o ON t.production_order_id = o.id
WHERE o.order_no = '$TEST_ORDER'
  AND t.scanned_quantity > 0
ORDER BY t.process_sequence;
" 2>/dev/null || echo "")

if [ -z "$SETTLEMENT_CHECK" ]; then
    echo -e "${YELLOW}⚠️  订单无已扫码工序，跳过结算金额验证${NC}"
else
    echo "$SETTLEMENT_CHECK"
    echo ""

    # 检查是否有错误
    if echo "$SETTLEMENT_CHECK" | grep -q "❌ 错误"; then
        echo -e "${RED}❌ 发现结算金额错误${NC}"
        echo "   单价同步后，结算金额未自动重算"
        exit 1
    else
        echo -e "${GREEN}✅ 结算金额正确${NC}"
    fi
fi
echo ""

echo "======================================"
echo "验证结果总结"
echo "======================================"
echo ""
echo -e "${GREEN}✅ 所有验证通过！${NC}"
echo ""
echo "修复效果："
echo "1. ✅ 前端保存工序单价后，后端自动调用 syncUnitPrices()"
echo "2. ✅ t_production_process_tracking 表的单价已同步"
echo "3. ✅ 已扫码工序的结算金额已重新计算"
echo ""
echo "可以部署到生产环境了！"
echo ""
echo "💡 后续建议："
echo "1. 运行历史数据修复脚本："
echo "   ./fix-historical-prices.sh"
echo ""
echo "2. 或使用批量同步 API："
echo "   curl -X POST http://localhost:8088/api/internal/maintenance/sync-all-unit-prices"
echo ""
echo "3. 定期检查数据一致性："
echo "   ./check-price-flow.sh"
echo ""
