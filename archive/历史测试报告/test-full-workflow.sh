#!/bin/bash

# 完整业务流程测试脚本

echo "=========================================="
echo "🧪 完整业务流程测试"
echo "=========================================="
echo ""

DB="docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain --default-character-set=utf8mb4"

# 清理之前的测试数据
echo "🧹 清理旧测试数据..."
$DB -e "DELETE FROM t_scan_record WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
$DB -e "DELETE FROM t_product_warehousing WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
$DB -e "DELETE FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
$DB -e "DELETE FROM t_cutting_task WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
$DB -e "DELETE FROM t_material_purchase WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
$DB -e "DELETE FROM t_production_order WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning

echo "✅ 清理完成"
echo ""

# 第1步：创建订单
echo "📦 第1步：创建测试订单..."
$DB -e "
INSERT INTO t_production_order (id, order_no, style_id, style_no, style_name, factory_id, factory_name, order_quantity, status, create_time)
VALUES (UUID(), 'TEST20260126001', '1', 'ST-TEST-001', '测试款式', '1', '测试工厂', 100, 'pending', NOW());
"2>&1 | grep -v Warning

$DB -e "SELECT order_no, style_no, order_quantity, status FROM t_production_order WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
echo ""

# 第2步：创建物料采购
echo "🛒 第2步：创建物料采购单..."
$DB -e "
INSERT INTO t_material_purchase (id, purchase_no, material_code, material_name, unit, purchase_quantity, supplier_name, receiver_id, receiver_name, order_no, create_time)
VALUES (UUID(), 'MP-TEST-001', 'MC-001', '面料-黑色', '米', 150, '供应商A', '1', '张三', 'TEST20260126001', NOW());
" 2>&1 | grep -v Warning

$DB -e "SELECT purchase_no, material_name, purchase_quantity FROM t_material_purchase WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
echo ""

# 第3步：创建裁剪单
echo "✂️  第3步：创建裁剪单..."
$DB -e "
SET @order_id = (SELECT id FROM t_production_order WHERE order_no = 'TEST20260126001');
INSERT INTO t_cutting_task (id, production_order_id, production_order_no, style_id, style_no, style_name, color, size, order_quantity, status, create_time)
VALUES (UUID(), @order_id, 'TEST20260126001', '1', 'ST-TEST-001', '测试款式', '黑色', 'M', 100, 'pending', NOW());
" 2>&1 | grep -v Warning

$DB -e "SELECT production_order_no, color, size, order_quantity FROM t_cutting_task WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
echo ""

# 第4步：创建菲号
echo "🎫 第4步：创建5个菲号（每个20件）..."
ORDER_ID=$($DB -e "SELECT id FROM t_production_order WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v id | head -1 | tr -d ' \t\n\r')

for i in {1..5}; do
  BUNDLE_NO=$(printf "TEST20260126001-黑色-%02d" $i)
  $DB -e "INSERT INTO t_cutting_bundle (id, production_order_id, production_order_no, style_id, color, size, bundle_no, quantity, create_time) VALUES (UUID(), '$ORDER_ID', 'TEST20260126001', '1', '黑色', 'M', '$BUNDLE_NO', 20, NOW());" 2>&1 | grep -v Warning
done

$DB -e "SELECT bundle_no, quantity FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
echo ""

# 第5步：模拟扫码（做领工序）
echo "📱 第5步：模拟扫码生产（做领工序）..."
for i in {1..5}; do
  BUNDLE_NO=$(printf "TEST20260126001-黑色-%02d" $i)
  $DB -e "INSERT INTO t_scan_record (id, order_no, bundle_no, process_name, scan_type, quantity, operator_id, operator_name, scan_time, create_time) VALUES (UUID(), 'TEST20260126001', '$BUNDLE_NO', '做领', 'BUNDLE', 20, '1', '工人A', NOW(), NOW());" 2>&1 | grep -v Warning
  sleep 1
done

SCAN_COUNT=$($DB -e "SELECT COUNT(*) FROM t_scan_record WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | tail -1)
echo "扫码记录数：$SCAN_COUNT"
echo ""

# 第6步：质检入库
echo "✅ 第6步：质检入库..."
ORDER_ID=$($DB -e "SELECT id FROM t_production_order WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v id | head -1 | tr -d ' \t\n\r')

for i in {1..5}; do
  BUNDLE_NO=$(printf "TEST20260126001-黑色-%02d" $i)
  BUNDLE_ID=$($DB -e "SELECT id FROM t_cutting_bundle WHERE bundle_no = '$BUNDLE_NO';" 2>&1 | grep -v Warning | grep -v id | head -1 | tr -d ' \t\n\r')

  if [ -n "$BUNDLE_ID" ]; then
    WH_NO="WH-$(date +%Y%m%d%H%M%S)-$i"
    $DB -e "INSERT INTO t_product_warehousing (id, warehousing_no, order_id, order_no, cutting_bundle_id, warehousing_quantity, quality_status, quality_operator_name, warehouse, create_time) VALUES (UUID(), '$WH_NO', '$ORDER_ID', 'TEST20260126001', '$BUNDLE_ID', 20, 'qualified', '质检员A', 'A仓', NOW());" 2>&1 | grep -v Warning
    sleep 1
  fi
done

WH_COUNT=$($DB -e "SELECT COUNT(*), SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | tail -1)
echo "入库批次和数量：$WH_COUNT"
echo ""

# 第7步：检查数据一致性
echo "🔍 第7步：数据一致性检查..."
echo "=========================================="

echo "订单数量 vs 菲号总数："
$DB -e "
SELECT
  (SELECT order_quantity FROM t_production_order WHERE order_no = 'TEST20260126001') as 订单数量,
  (SELECT SUM(quantity) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001') as 菲号总数,
  (SELECT SUM(quantity) FROM t_scan_record WHERE order_no = 'TEST20260126001') as 扫码总数,
  (SELECT SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no = 'TEST20260126001') as 入库总数;
" 2>&1 | grep -v Warning
echo ""

# 第8步：工资结算数据
echo "💰 第8步：工资结算数据..."
echo "按工序统计："
$DB -e "
SELECT
  process_name as 工序,
  COUNT(*) as 扫码次数,
  SUM(quantity) as 总数量,
  operator_name as 操作员
FROM t_scan_record
WHERE order_no = 'TEST20260126001'
GROUP BY process_name, operator_name;
" 2>&1 | grep -v Warning
echo ""

# 检查工资结算表是否存在
echo "检查工资结算表..."
TABLE_EXISTS=$($DB -e "SHOW TABLES LIKE 't_payroll%';" 2>&1 | grep -v Warning | wc -l)
if [ $TABLE_EXISTS -gt 0 ]; then
  echo "工资结算表："
  $DB -e "SHOW TABLES LIKE 't_payroll%';" 2>&1 | grep -v Warning
else
  echo "⚠️  工资结算表不存在"
fi
echo ""

echo "=========================================="
echo "🎯 测试总结"
echo "=========================================="
echo ""
echo "✅ 创建订单：100件"
echo "✅ 创建菲号：5个（每个20件）"
echo "✅ 扫码记录：$SCAN_COUNT 条"
echo "✅ 质检入库：5批次"
echo ""
echo "数据一致性："
$DB -e "
SELECT
  CASE
    WHEN (SELECT order_quantity FROM t_production_order WHERE order_no = 'TEST20260126001') = (SELECT SUM(quantity) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001')
    AND (SELECT SUM(quantity) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001') = (SELECT SUM(quantity) FROM t_scan_record WHERE order_no = 'TEST20260126001')
    AND (SELECT SUM(quantity) FROM t_scan_record WHERE order_no = 'TEST20260126001') = (SELECT SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no = 'TEST20260126001')
    THEN '✅ 数据一致'
    ELSE '❌ 数据不一致'
  END as 检查结果;
" 2>&1 | grep -v Warning
echo ""
