-- 从订单的工序配置中批量更新扫码记录的成本
-- 此脚本会遍历所有订单，更新对应的扫码记录

-- 临时表：存储所有工序价格
CREATE TEMPORARY TABLE IF NOT EXISTS temp_process_prices AS
SELECT DISTINCT
  po.order_no,
  TRIM(JSON_UNQUOTE(JSON_EXTRACT(po.progress_workflow_json, CONCAT('$.nodes[', n.idx, '].name')))) as process_name,
  CAST(JSON_UNQUOTE(JSON_EXTRACT(po.progress_workflow_json, CONCAT('$.nodes[', n.idx, '].unitPrice'))) AS DECIMAL(15,2)) as unit_price
FROM t_production_order po
CROSS JOIN (
  SELECT 0 as idx UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
  UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10 UNION ALL SELECT 11
  UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15
) n
WHERE JSON_VALID(po.progress_workflow_json)
  AND JSON_LENGTH(po.progress_workflow_json, '$.nodes') > n.idx
  AND JSON_UNQUOTE(JSON_EXTRACT(po.progress_workflow_json, CONCAT('$.nodes[', n.idx, '].name'))) IS NOT NULL;

-- 更新扫码记录
UPDATE t_scan_record sr
INNER JOIN temp_process_prices pp
  ON sr.order_no = pp.order_no
  AND sr.process_name = pp.process_name
SET
  sr.process_unit_price = pp.unit_price,
  sr.scan_cost = pp.unit_price * COALESCE(sr.quantity, 0)
WHERE sr.scan_cost IS NULL OR sr.process_unit_price IS NULL;

-- 查看更新结果
SELECT
  COUNT(*) as total_updated,
  SUM(CASE WHEN scan_cost > 0 THEN 1 ELSE 0 END) as with_cost,
  SUM(CASE WHEN scan_cost = 0 OR scan_cost IS NULL THEN 1 ELSE 0 END) as zero_cost
FROM t_scan_record;

-- 清理临时表
DROP TEMPORARY TABLE IF EXISTS temp_process_prices;
