CREATE OR REPLACE VIEW v_production_order_stage_done_agg AS
SELECT
  t.order_id AS order_id,
  t.tenant_id AS tenant_id,
  t.stage_name AS stage_name,
  SUM(IFNULL(t.quantity, 0)) AS done_quantity,
  MAX(t.scan_time) AS last_scan_time
FROM (
  SELECT
    sr.order_id,
    sr.tenant_id,
    COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) AS stage_name,
    sr.quantity,
    sr.scan_time
  FROM t_scan_record sr
  WHERE sr.scan_result = 'success'
    AND sr.quantity > 0
    AND sr.scan_type IN ('production', 'cutting', 'quality', 'warehouse', 'pattern')
) t
WHERE t.stage_name IS NOT NULL AND t.stage_name <> ''
GROUP BY t.order_id, t.tenant_id, t.stage_name;
