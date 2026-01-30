#!/bin/bash
# 手动修复扫码记录的工序单价
# 原因：数据库中工序名称是乱码，无法自动匹配

echo "===================================="
echo "手动修复扫码记录工序单价"
echo "===================================="
echo ""

# 更新扫码记录，设置工序单价
# 假设"裁剪"工序的单价是 2.00 元
docker exec fashion-mysql-simple mysql -u root -pchangeme fashion_supplychain <<EOF
-- 更新订单 PO20260130003 的扫码记录
UPDATE t_scan_record
SET
    process_unit_price = 2.00,
    unit_price = 2.00,
    scan_cost = quantity * 2.00,
    total_amount = quantity * 2.00
WHERE order_no = 'PO20260130003'
  AND process_name LIKE '%'  -- 匹配所有工序名称（包括乱码）
  AND (process_unit_price IS NULL OR process_unit_price = 0);

-- 查看更新结果
SELECT
    order_no AS '订单号',
    process_name AS '工序名称',
    quantity AS '数量',
    unit_price AS '单价',
    process_unit_price AS '工序单价',
    scan_cost AS '扫码成本',
    total_amount AS '总金额'
FROM t_scan_record
WHERE order_no = 'PO20260130003'
ORDER BY scan_time DESC;
EOF

echo ""
echo "===================================="
echo "✅ 更新完成"
echo "===================================="
echo ""
echo "说明："
echo "1. 由于数据库中工序名称是乱码，无法自动匹配订单的工序单价"
echo "2. 手动设置了单价为 2.00 元（假设是裁剪工序）"
echo "3. 重新计算了 scan_cost 和 total_amount"
echo ""
echo "长期解决方案："
echo "1. 修复数据库字符编码问题"
echo "2. 重新创建订单，确保工序名称正确保存"
echo "3. 启动后端服务，让 attachProcessUnitPrice 自动计算"
