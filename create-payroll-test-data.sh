#!/bin/bash

# 创建工资结算完整测试数据

echo "=========================================="
echo "💰 创建工资结算测试数据"
echo "=========================================="
echo ""

DB="docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain --default-character-set=utf8mb4"

# 第1步：创建更多测试员工
echo "👥 第1步：创建测试员工..."
$DB -e "
INSERT INTO t_user (username, password, name, role_name, phone, status)
VALUES
  ('worker_001', '\$2a\$10\$N.zmdr9k7uOCQb376NoUnuTXJg4akfcVjnY8fRk8z6qQn9EDJqP8.', '张三', '员工', '13800138001', 'ENABLED'),
  ('worker_002', '\$2a\$10\$N.zmdr9k7uOCQb376NoUnuTXJg4akfcVjnY8fRk8z6qQn9EDJqP8.', '李四', '员工', '13800138002', 'ENABLED'),
  ('worker_003', '\$2a\$10\$N.zmdr9k7uOCQb376NoUnuTXJg4akfcVjnY8fRk8z6qQn9EDJqP8.', '王五', '员工', '13800138003', 'ENABLED')
ON DUPLICATE KEY UPDATE name=VALUES(name);
" 2>&1 | grep -v Warning

$DB -e "SELECT id, username, name FROM t_user WHERE username LIKE 'worker_%';" 2>&1 | grep -v Warning
echo ""

# 第2步：获取员工ID
WORKER1_ID=$($DB -e "SELECT id FROM t_user WHERE username = 'worker_001';" 2>&1 | grep -v Warning | grep -v id | tr -d ' ')
WORKER2_ID=$($DB -e "SELECT id FROM t_user WHERE username = 'worker_002';" 2>&1 | grep -v Warning | grep -v id | tr -d ' ')
WORKER3_ID=$($DB -e "SELECT id FROM t_user WHERE username = 'worker_003';" 2>&1 | grep -v Warning | grep -v id | tr -d ' ')
ORDER_ID=$($DB -e "SELECT id FROM t_production_order WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v id | tr -d ' ')
BUNDLE_IDS=$($DB -e "SELECT id FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v id)

echo "员工1 ID: $WORKER1_ID (张三)"
echo "员工2 ID: $WORKER2_ID (李四)"
echo "员工3 ID: $WORKER3_ID (王五)"
echo ""

# 第3步：创建多工序扫码记录
echo "📱 第3步：创建多工序扫码记录..."

# 张三 - 做领工序（已有5条）
# 李四 - 钉扣工序
i=1
for BUNDLE_ID in $BUNDLE_IDS; do
  $DB -e "
  INSERT INTO t_scan_record (
    id, order_no, order_id, cutting_bundle_id, process_name,
    scan_type, quantity, unit_price, total_amount, settlement_status,
    operator_id, operator_name, scan_time, create_time
  ) VALUES (
    UUID(), 'TEST20260126001', '$ORDER_ID', '$BUNDLE_ID', '钉扣',
    'BUNDLE', 20, 0.30, 6.00, 'pending',
    '$WORKER2_ID', '李四', NOW(), NOW()
  );
  " 2>&1 | grep -v Warning
  sleep 0.5
  i=$((i+1))
done

# 王五 - 整烫工序
i=1
for BUNDLE_ID in $BUNDLE_IDS; do
  $DB -e "
  INSERT INTO t_scan_record (
    id, order_no, order_id, cutting_bundle_id, process_name,
    scan_type, quantity, unit_price, total_amount, settlement_status,
    operator_id, operator_name, scan_time, create_time
  ) VALUES (
    UUID(), 'TEST20260126001', '$ORDER_ID', '$BUNDLE_ID', '整烫',
    'BUNDLE', 20, 0.40, 8.00, 'pending',
    '$WORKER3_ID', '王五', NOW(), NOW()
  );
  " 2>&1 | grep -v Warning
  sleep 0.5
  i=$((i+1))
done

echo ""

# 第4步：查看工资汇总
echo "💰 第4步：工资汇总..."
$DB -e "
SELECT
  operator_name as '员工',
  process_name as '工序',
  COUNT(*) as '扫码次数',
  SUM(quantity) as '数量',
  AVG(unit_price) as '单价',
  SUM(total_amount) as '应发工资'
FROM t_scan_record
WHERE order_no = 'TEST20260126001'
GROUP BY operator_name, process_name
ORDER BY operator_name, process_name;
" 2>&1 | grep -v Warning
echo ""

# 第5步：总计
echo "📊 第5步：员工总工资..."
$DB -e "
SELECT
  operator_name as '员工',
  COUNT(DISTINCT process_name) as '工序数',
  COUNT(*) as '总扫码次数',
  SUM(quantity) as '总数量',
  SUM(total_amount) as '总工资'
FROM t_scan_record
WHERE order_no = 'TEST20260126001'
GROUP BY operator_name
ORDER BY SUM(total_amount) DESC;
" 2>&1 | grep -v Warning
echo ""

echo "=========================================="
echo "✅ 工资数据创建完成"
echo "=========================================="
echo ""
echo "测试员工："
echo "  - 张三: 做领工序, 50.00元"
echo "  - 李四: 钉扣工序, 30.00元"
echo "  - 王五: 整烫工序, 40.00元"
echo "  - 总计: 120.00元"
echo ""
