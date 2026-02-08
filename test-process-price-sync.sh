#!/bin/bash

# 工序单价同步验证脚本
# 用途：验证前端更新工序单价后，是否正确同步到 t_production_process_tracking 表
# 修复对应：lockProgressWorkflow 方法未调用 syncUnitPrices() 的问题

set -e

echo "======================================"
echo "工序单价同步测试"
echo "======================================"
echo ""

# 数据库连接信息
DB_CONTAINER="fashion-mysql-simple"
DB_NAME="fashion_supplychain"
DB_USER="root"
DB_PASS="changeme"

# 测试订单号
TEST_ORDER_NO="${1:-PO20260206001}"

echo "1️⃣  查询测试订单信息..."
ORDER_INFO=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT
    id,
    order_no,
    style_no,
    progress_workflow_locked,
    progress_workflow_locked_at
FROM t_production_order
WHERE order_no = '$TEST_ORDER_NO'
LIMIT 1;
")

if [ -z "$ORDER_INFO" ]; then
    echo "❌ 未找到订单：$TEST_ORDER_NO"
    exit 1
fi

ORDER_ID=$(echo "$ORDER_INFO" | awk '{print $1}')
STYLE_NO=$(echo "$ORDER_INFO" | awk '{print $3}')
LOCKED=$(echo "$ORDER_INFO" | awk '{print $4}')
LOCKED_AT=$(echo "$ORDER_INFO" | awk '{print $5}')

echo "   订单ID: $ORDER_ID"
echo "   订单号: $TEST_ORDER_NO"
echo "   款式号: $STYLE_NO"
echo "   锁定状态: $LOCKED"
echo "   锁定时间: $LOCKED_AT"
echo ""

echo "2️⃣  查询订单工序配置（progressWorkflowJson）..."
WORKFLOW_JSON=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT progress_workflow_json
FROM t_production_order
WHERE id = '$ORDER_ID';
" | sed 's/NULL//g')

if [ -z "$WORKFLOW_JSON" ]; then
    echo "   ⚠️  订单未配置工序流程"
    echo ""
else
    echo "   ✅ 已配置工序流程"
    # 提取工序单价信息（简化显示）
    echo "$WORKFLOW_JSON" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    nodes = data.get('nodes', [])
    print(f'   工序数量: {len(nodes)}')
    print('   工序单价:')
    for node in nodes:
        name = node.get('name', '未命名')
        price = node.get('unitPrice', 0)
        print(f'      - {name}: {price}元')
except:
    print('   解析失败')
" 2>/dev/null || echo "   （JSON解析失败，跳过详情显示）"
    echo ""
fi

echo "3️⃣  查询工序跟踪表中的单价..."
TRACKING_PRICES=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -e "
SELECT
    process_code AS '工序代码',
    process_name AS '工序名称',
    unit_price AS '单价',
    bundle_quantity AS '菲号数量',
    scanned_quantity AS '已扫数量',
    settlement_amount AS '结算金额',
    update_time AS '更新时间'
FROM t_production_process_tracking
WHERE production_order_id = '$ORDER_ID'
ORDER BY process_sequence;
")

if [ -z "$(echo "$TRACKING_PRICES" | tail -n +2)" ]; then
    echo "   ⚠️  未找到工序跟踪记录（可能订单未裁剪完成）"
    echo ""
else
    echo "$TRACKING_PRICES"
    echo ""
fi

echo "4️⃣  查询最近一次单价同步日志..."
SYNC_LOG=$(docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -N -e "
SELECT
    CONCAT(action_type, ': ', remark) AS log_info,
    DATE_FORMAT(create_time, '%Y-%m-%d %H:%i:%s') AS time
FROM t_operation_log
WHERE table_name = 't_production_process_tracking'
  AND record_id = '$ORDER_ID'
  AND remark LIKE '%同步单价%'
ORDER BY create_time DESC
LIMIT 3;
" 2>/dev/null || echo "")

if [ -z "$SYNC_LOG" ]; then
    echo "   ⚠️  未找到单价同步日志（可能未启用操作日志）"
    echo ""
else
    echo "$SYNC_LOG"
    echo ""
fi

echo "======================================"
echo "💡 操作说明"
echo "======================================"
echo ""
echo "如何测试单价同步："
echo ""
echo "1. 解锁订单（如果已锁定）："
echo "   docker exec -i $DB_CONTAINER mysql -u$DB_USER -p$DB_PASS $DB_NAME -e \\"
echo "   \"UPDATE t_production_order SET progress_workflow_locked = 0 WHERE id = '$ORDER_ID';\""
echo ""
echo "2. 在前端修改工序单价："
echo "   - 打开订单 $TEST_ORDER_NO 的进度详情"
echo "   - 点击任意工序节点，修改【工序单价】"
echo "   - 点击【保存】按钮"
echo ""
echo "3. 重新运行本脚本，检查单价是否同步："
echo "   ./test-process-price-sync.sh $TEST_ORDER_NO"
echo ""
echo "4. 预期结果："
echo "   ✅ progressWorkflowJson 中的单价已更新"
echo "   ✅ t_production_process_tracking 表中的 unit_price 已同步"
echo "   ✅ settlement_amount 已重新计算"
echo ""

echo "======================================"
echo "验证完成"
echo "======================================"
