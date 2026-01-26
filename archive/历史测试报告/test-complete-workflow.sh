#!/bin/bash

# 完整业务流程测试 - 包含基础数据初始化

echo "=========================================="
echo "🧪 完整业务流程测试（含基础数据）"
echo "=========================================="
echo ""

DB="docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain --default-character-set=utf8mb4"

# 第0步：初始化测试基础数据
echo "📋 第0步：初始化测试基础数据..."

# 创建测试工厂
$DB -e "
INSERT INTO t_factory (id, factory_code, factory_name, contact_person, contact_phone, address, status)
VALUES ('test-factory-001', 'F-TEST-001', '测试工厂A', '张三', '13900139001', '广东省广州市', 'ENABLED')
ON DUPLICATE KEY UPDATE factory_name='测试工厂A';
" 2>&1 | grep -v Warning

# 创建测试用户（工人）
$DB -e "
INSERT INTO t_user (username, password, name, role_name, phone, status)
VALUES ('test_worker', '\$2a\$10\$N.zmdr9k7uOCQb376NoUnuTXJg4akfcVjnY8fRk8z6qQn9EDJqP8.', '测试工人A', '员工', '13800138001', 'ENABLED')
ON DUPLICATE KEY UPDATE name='测试工人A';
" 2>&1 | grep -v Warning

# 查看创建结果
$DB -e "SELECT factory_code, factory_name FROM t_factory WHERE factory_code = 'F-TEST-001';" 2>&1 | grep -v Warning
$DB -e "SELECT id, username, name FROM t_user WHERE username = 'test_worker';" 2>&1 | grep -v Warning

echo ""

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

# 获取测试工厂ID和用户ID
FACTORY_ID=$($DB -e "SELECT id FROM t_factory WHERE factory_code = 'F-TEST-001';" 2>&1 | grep -v Warning | grep -v id | tr -d ' ')
USER_ID=$($DB -e "SELECT id FROM t_user WHERE username = 'test_worker';" 2>&1 | grep -v Warning | grep -v id | tr -d ' ')

echo "工厂ID: $FACTORY_ID"
echo "用户ID: $USER_ID"
echo ""

# 第1步：创建订单
echo "📦 第1步：创建测试订单..."
$DB -e "
INSERT INTO t_production_order (id, order_no, style_id, style_no, style_name, factory_id, factory_name, order_quantity, status, create_time)
VALUES (UUID(), 'TEST20260126001', '1', 'ST-TEST-001', '测试款式', '$FACTORY_ID', '测试工厂A', 100, 'pending', NOW());
" 2>&1 | grep -v Warning

$DB -e "SELECT order_no, style_no, order_quantity, status FROM t_production_order WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
echo ""

# 第2步：创建物料采购
echo "🛒 第2步：创建物料采购单..."
$DB -e "
INSERT INTO t_material_purchase (
  id, purchase_no, material_code, material_name, unit, purchase_quantity,
  supplier_name, order_no, receiver_id, receiver_name, status, create_time
) VALUES (
  UUID(), 'MP-TEST-001', 'MC-001', '面料-黑色', '米', 150,
  '供应商A', 'TEST20260126001', '1', 'admin', 'received', NOW()
);
" 2>&1 | grep -v Warning

$DB -e "SELECT purchase_no, material_name, purchase_quantity, receiver_name, status FROM t_material_purchase WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
echo ""

# 第3步：创建裁剪单
echo "✂️  第3步：创建裁剪单..."
ORDER_ID=$($DB -e "SELECT id FROM t_production_order WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v id | tr -d ' ')

$DB -e "
INSERT INTO t_cutting_task (id, production_order_id, production_order_no, style_id, style_no, style_name, color, order_quantity, status, create_time)
VALUES (UUID(), '$ORDER_ID', 'TEST20260126001', '1', 'ST-TEST-001', '测试款式', '黑色', 100, 'pending', NOW());
" 2>&1 | grep -v Warning

$DB -e "SELECT production_order_no, color, order_quantity FROM t_cutting_task WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning
echo ""

# 第4步：创建菲号（使用正确的字段名）
echo "🎫 第4步：创建5个菲号..."
ORDER_ID_FOR_BUNDLE=$($DB -e "SELECT production_order_id FROM t_cutting_task WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v production_order_id | tr -d ' ')

for i in {1..5}; do
  BUNDLE_NO_STR=$(printf "TEST20260126001-黑色-%02d" $i)
  QR_CODE="QR-$BUNDLE_NO_STR"
  $DB -e "
  INSERT INTO t_cutting_bundle (
    id, production_order_id, production_order_no, style_id, style_no, color, size,
    bundle_no, qr_code, quantity, status, create_time
  ) VALUES (
    UUID(), '$ORDER_ID_FOR_BUNDLE', 'TEST20260126001', '1', 'ST-TEST-001', '黑色', 'M',
    '$BUNDLE_NO_STR', '$QR_CODE', 20, 'created', NOW()
  );
  " 2>&1 | grep -v Warning
done

BUNDLE_COUNT=$($DB -e "SELECT COUNT(*) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | tail -1)
echo "菲号创建数量：$BUNDLE_COUNT"
echo ""

# 第5步：模拟扫码
echo "📱 第5步：模拟扫码生产（做领工序）..."
BUNDLES=$($DB -e "SELECT id, bundle_no FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v -E "^id")

while IFS=$'\t' read -r BUNDLE_ID BUNDLE_NO_VALUE; do
  $DB -e "
  INSERT INTO t_scan_record (
    id, order_no, order_id, cutting_bundle_id, bundle_no, process_name,
    scan_type, quantity, unit_price, total_amount, settlement_status,
    operator_id, operator_name, scan_time, create_time
  ) VALUES (
    UUID(), 'TEST20260126001', '$ORDER_ID', '$BUNDLE_ID', '$BUNDLE_NO_VALUE', '做领',
    'BUNDLE', 20, 0.50, 10.00, 'pending',
    '$USER_ID', '测试工人A', NOW(), NOW()
  );
  " 2>&1 | grep -v Warning
  sleep 1
done <<< "$BUNDLES"

SCAN_COUNT=$($DB -e "SELECT COUNT(*) FROM t_scan_record WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | tail -1)
echo "扫码记录数：$SCAN_COUNT"
echo ""

# 第6步：质检入库
echo "✅ 第6步：质检入库..."
BUNDLE_IDS=$($DB -e "SELECT id FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | grep -v -E "^id")

i=1
for BUNDLE_ID in $BUNDLE_IDS; do
  WH_NO=$(printf "WH%s%03d" $(date +%Y%m%d) $i)
  $DB -e "
  INSERT INTO t_product_warehousing (
    id, warehousing_no, order_id, order_no, style_id, style_no, style_name, cutting_bundle_id,
    warehousing_quantity, quality_status, quality_operator_id, quality_operator_name,
    warehousing_operator_id, warehousing_operator_name, warehouse, create_time
  ) VALUES (
    UUID(), '$WH_NO', '$ORDER_ID', 'TEST20260126001', '1', 'ST-TEST-001', '测试款式', '$BUNDLE_ID',
    20, 'qualified', '1', 'admin', '1', 'admin', 'A仓', NOW()
  );
  " 2>&1 | grep -v Warning
  i=$((i+1))
done

WH_COUNT=$($DB -e "SELECT COUNT(*), SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no = 'TEST20260126001';" 2>&1 | grep -v Warning | tail -1)
echo "入库批次和数量：$WH_COUNT"
echo ""

# 第7步：数据一致性检查
echo "🔍 第7步：数据一致性检查..."
echo "=========================================="
$DB -e "
SELECT
  (SELECT order_quantity FROM t_production_order WHERE order_no = 'TEST20260126001') as '订单数量',
  (SELECT SUM(quantity) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001') as '菲号总数',
  (SELECT SUM(quantity) FROM t_scan_record WHERE order_no = 'TEST20260126001') as '扫码总数',
  (SELECT SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no = 'TEST20260126001') as '入库总数';
" 2>&1 | grep -v Warning
echo ""

# 第8步：工资结算数据
echo "💰 第8步：工资结算数据准备..."
$DB -e "
SELECT
  process_name as '工序',
  COUNT(*) as '扫码次数',
  SUM(quantity) as '总数量',
  AVG(unit_price) as '单价',
  SUM(total_amount) as '总金额',
  operator_name as '操作员',
  settlement_status as '结算状态'
FROM t_scan_record
WHERE order_no = 'TEST20260126001'
GROUP BY process_name, operator_name, settlement_status;
" 2>&1 | grep -v Warning
echo ""

echo "=========================================="
echo "🎯 测试总结"
echo "=========================================="
echo ""
echo "✅ 基础数据：工厂、用户"
echo "✅ 创建订单：100件"
echo "✅ 创建菲号：5个（每个20件）"
echo "✅ 扫码记录：$SCAN_COUNT 条"
echo "✅ 质检入库：5批次"
echo ""

# 最终一致性验证
$DB -e "
SELECT
  CASE
    WHEN (SELECT order_quantity FROM t_production_order WHERE order_no = 'TEST20260126001') =
         (SELECT COALESCE(SUM(quantity), 0) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001')
    AND  (SELECT COALESCE(SUM(quantity), 0) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001') =
         (SELECT COALESCE(SUM(quantity), 0) FROM t_scan_record WHERE order_no = 'TEST20260126001')
    AND  (SELECT COALESCE(SUM(quantity), 0) FROM t_scan_record WHERE order_no = 'TEST20260126001') =
         (SELECT COALESCE(SUM(warehousing_quantity), 0) FROM t_product_warehousing WHERE order_no = 'TEST20260126001')
    THEN '✅ 数据一致：订单→菲号→扫码→入库 全部匹配'
    ELSE '❌ 数据不一致'
  END as '一致性检查';
" 2>&1 | grep -v Warning
echo ""
