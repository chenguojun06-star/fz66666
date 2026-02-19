-- 清空指定订单的扫码记录
-- 用法：修改订单号后执行

-- 1. 备份当前数据（可选）
-- SELECT * FROM t_scan_record WHERE order_no = 'PO202601220001';

-- 2. 删除扫码记录
DELETE FROM t_scan_record WHERE order_no = 'PO202601220001';

-- 3. 验证
SELECT '删除完成，当前记录数：' AS info, COUNT(*) AS count FROM t_scan_record WHERE order_no = 'PO202601220001';

-- 4. 重置订单进度（可选）
UPDATE t_production_order
SET
    completed_quantity = 0,
    production_progress = 0
WHERE order_no = 'PO202601220001';

SELECT '订单进度已重置' AS result;
