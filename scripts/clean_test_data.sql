-- 清理TEST20260126001测试数据

-- 1. 删除扫码记录
DELETE FROM t_scan_record WHERE order_no = 'TEST20260126001';

-- 2. 删除入库记录
DELETE FROM t_product_warehousing WHERE order_no = 'TEST20260126001';

-- 3. 删除裁剪菲号
DELETE FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001';

-- 4. 删除物料采购（如果有）
DELETE FROM t_material_purchase WHERE order_no = 'TEST20260126001';

-- 5. 删除生产订单
DELETE FROM t_production_order WHERE order_no = 'TEST20260126001';

-- 验证删除结果
SELECT
  (SELECT COUNT(*) FROM t_scan_record WHERE order_no = 'TEST20260126001') as scan_records,
  (SELECT COUNT(*) FROM t_product_warehousing WHERE order_no = 'TEST20260126001') as warehousing,
  (SELECT COUNT(*) FROM t_cutting_bundle WHERE production_order_no = 'TEST20260126001') as bundles,
  (SELECT COUNT(*) FROM t_production_order WHERE order_no = 'TEST20260126001') as orders;
