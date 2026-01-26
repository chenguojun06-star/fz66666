#!/bin/bash

# 简化版完整业务流程测试

DB="docker exec fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain --default-character-set=utf8mb4"

echo "========== 完整业务流程测试 =========="
echo ""

# 清理
echo "清理旧数据..."
$DB -e "DELETE FROM t_scan_record WHERE order_no = 'TEST202601260001';" 2>&1 > /dev/null
$DB -e "DELETE FROM t_product_warehousing WHERE order_no = 'TEST202601260001';" 2>&1 > /dev/null
$DB -e "DELETE FROM t_cutting_bundle WHERE production_order_no = 'TEST202601260001';" 2>&1 > /dev/null
$DB -e "DELETE FROM t_cutting_task WHERE production_order_no = 'TEST202601260001';" 2>&1 > /dev/null
$DB -e "DELETE FROM t_material_purchase WHERE order_no = 'TEST202601260001';" 2>&1 > /dev/null
$DB -e "DELETE FROM t_production_order WHERE order_no = 'TEST202601260001';" 2>&1 > /dev/null
echo "✅ 清理完成"
echo ""

# 1. 创建订单
echo "1️⃣  创建订单（100件）..."
$DB -e "INSERT INTO t_production_order (id, order_no, style_id, style_no, style_name, factory_id, factory_name, order_quantity, status, create_time) VALUES (UUID(), 'TEST202601260001', '1', 'ST-001', '测试款', '1', '工厂A', 100, 'pending', NOW());" 2>&1 > /dev/null

ORDER_ID=$($DB -e "SELECT id FROM t_production_order WHERE order_no = 'TEST202601260001';" 2>&1 | grep -v id | head -1 | tr -d ' \t\n\r')
echo "订单ID: $ORDER_ID"
echo ""

# 2. 创建菲号
echo "2️⃣  创建菲号（5个×20件）..."
for i in {1..5}; do
  BUNDLE_NO=$(printf "TEST202601260001-黑-%02d" $i)
  QR_CODE="{\"type\":\"bundle\",\"orderNo\":\"TEST202601260001\",\"bundleNo\":\"$BUNDLE_NO\"}"

  $DB -e "INSERT INTO t_cutting_bundle (
    id, production_order_id, production_order_no,
    style_id, style_no, bundle_no, qr_code,
    color, size, quantity, create_time
  ) VALUES (
    UUID(), '$ORDER_ID', 'TEST202601260001',
    '1', 'ST-001', '$BUNDLE_NO', '$QR_CODE',
    '黑色', 'M', 20, NOW()
  );" 2>&1 > /dev/null
done

BUNDLE_COUNT=$($DB -e "SELECT COUNT(*) FROM t_cutting_bundle WHERE production_order_no = 'TEST202601260001';" 2>&1 | tail -1)
echo "菲号数量: $BUNDLE_COUNT"
echo ""

# 3. 扫码生产
echo "3️⃣  扫码生产（做领工序）..."
for i in {1..5}; do
  BUNDLE_NO=$(printf "TEST202601260001-黑-%02d" $i)

  $DB -e "INSERT INTO t_scan_record (
    id, order_no, bundle_no, process_name, scan_type,
    quantity, operator_id, operator_name, scan_time, create_time
  ) VALUES (
    UUID(), 'TEST202601260001', '$BUNDLE_NO', '做领', 'BUNDLE',
    20, '1', '工人A', NOW(), NOW()
  );" 2>&1 > /dev/null
  sleep 1
done

SCAN_COUNT=$($DB -e "SELECT COUNT(*) FROM t_scan_record WHERE order_no = 'TEST202601260001';" 2>&1 | tail -1)
echo "扫码记录: $SCAN_COUNT"
echo ""

# 4. 质检入库
echo "4️⃣  质检入库..."
for i in {1..5}; do
  BUNDLE_NO=$(printf "TEST202601260001-黑-%02d" $i)
  BUNDLE_ID=$($DB -e "SELECT id FROM t_cutting_bundle WHERE bundle_no = '$BUNDLE_NO';" 2>&1 | grep -v id | head -1 | tr -d ' \t\n\r')
  WH_NO="WH-$(date +%Y%m%d%H%M%S)-$i"

  if [ -n "$BUNDLE_ID" ]; then
    $DB -e "INSERT INTO t_product_warehousing (
      id, warehousing_no, order_id, order_no, cutting_bundle_id,
      warehousing_quantity, quality_status, quality_operator_name,
      warehouse, create_time
    ) VALUES (
      UUID(), '$WH_NO', '$ORDER_ID', 'TEST202601260001', '$BUNDLE_ID',
      20, 'qualified', '质检员A', 'A仓', NOW()
    );" 2>&1 > /dev/null
    sleep 1
  fi
done

WH_COUNT=$($DB -e "SELECT COUNT(*), SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no = 'TEST202601260001';" 2>&1 | tail -1)
echo "入库批次/数量: $WH_COUNT"
echo ""

# 数据一致性
echo "========== 数据一致性检查 =========="
$DB -e "
SELECT
  (SELECT order_quantity FROM t_production_order WHERE order_no = 'TEST202601260001') as 订单数,
  (SELECT SUM(quantity) FROM t_cutting_bundle WHERE production_order_no = 'TEST202601260001') as 菲号数,
  (SELECT SUM(quantity) FROM t_scan_record WHERE order_no = 'TEST202601260001') as 扫码数,
  (SELECT SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no = 'TEST202601260001') as 入库数;
" 2>&1 | grep -v Warning

# 工资结算
echo ""
echo "========== 工资结算数据 =========="
$DB -e "
SELECT
  process_name as 工序,
  operator_name as 操作员,
  COUNT(*) as 扫码次数,
  SUM(quantity) as 总数量
FROM t_scan_record
WHERE order_no = 'TEST202601260001'
GROUP BY process_name, operator_name;
" 2>&1 | grep -v Warning

echo ""
echo "========== 测试完成 =========="
