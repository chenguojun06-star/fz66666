-- 更新扫码记录的工序单价和扫码成本
-- 从订单的 progress_workflow_json 中提取工序单价，并计算扫码成本

UPDATE t_scan_record sr
INNER JOIN t_production_order po ON sr.order_no = po.order_no
CROSS JOIN (
  SELECT
    sr2.id as scan_id,
    COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(po2.progress_workflow_json,
        CONCAT('$.nodes[', idx.n, '].unitPrice')
      )),
      '0'
    ) as node_price
  FROM t_scan_record sr2
  INNER JOIN t_production_order po2 ON sr2.order_no = po2.order_no
  CROSS JOIN (
    SELECT 0 as n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
    UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7
    UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
  ) idx
  WHERE JSON_VALID(po2.progress_workflow_json)
    AND JSON_UNQUOTE(JSON_EXTRACT(po2.progress_workflow_json,
        CONCAT('$.nodes[', idx.n, '].name')
      )) = sr2.process_name
) price_lookup
SET
  sr.process_unit_price = CAST(price_lookup.node_price AS DECIMAL(15,2)),
  sr.scan_cost = CAST(price_lookup.node_price AS DECIMAL(15,2)) * COALESCE(sr.quantity, 0)
WHERE sr.id = price_lookup.scan_id
  AND (sr.scan_cost IS NULL OR sr.process_unit_price IS NULL);

-- 输出更新结果
SELECT
  '更新完成' as status,
  COUNT(*) as updated_count
FROM t_scan_record
WHERE scan_cost IS NOT NULL;
