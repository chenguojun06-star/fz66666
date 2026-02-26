-- 筛选链路异常核查（质检/入库）
-- 用途：验证“可质检/可入库”筛选是否误包含不应出现的菲号
-- 执行方式：
-- docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < scripts/check-pending-filter-anomalies.sql

WITH bundle_states AS (
  SELECT
    sr.order_id,
    sr.cutting_bundle_id,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'production' THEN 1 ELSE 0 END) AS has_production,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'quality' THEN 1 ELSE 0 END) AS has_quality,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'quality'
             AND sr.process_code = 'quality_receive' AND sr.confirm_time IS NOT NULL THEN 1 ELSE 0 END) AS has_quality_confirmed,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'quality'
             AND sr.process_code = 'quality_receive' AND sr.confirm_time IS NOT NULL
             AND sr.remark LIKE 'unqualified%' THEN 1 ELSE 0 END) AS has_defective_quality,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'warehouse'
             AND (sr.process_code IS NULL OR sr.process_code <> 'warehouse_rollback') THEN 1 ELSE 0 END) AS has_warehouse,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'production' AND (
              LOWER(IFNULL(sr.process_code, '')) LIKE '%packaging%'
              OR sr.process_code IN ('包装','打包','入袋','后整','装箱','封箱','贴标','packing')
              OR sr.process_name IN ('包装','打包','入袋','后整','装箱','封箱','贴标','packing')
        ) THEN 1 ELSE 0 END) AS has_packaging
  FROM t_scan_record sr
  WHERE sr.cutting_bundle_id IS NOT NULL
    AND sr.cutting_bundle_id <> ''
  GROUP BY sr.order_id, sr.cutting_bundle_id
),
readiness AS (
  SELECT
    bs.order_id,
    bs.cutting_bundle_id,
    po.order_no,
    po.status AS order_status,
    po.delete_flag,
    bs.has_production,
    bs.has_quality,
    bs.has_quality_confirmed,
    bs.has_defective_quality,
    bs.has_packaging,
    bs.has_warehouse,
    CASE WHEN bs.has_production = 1 AND bs.has_quality = 0 THEN 1 ELSE 0 END AS in_pending_qc,
    CASE WHEN bs.has_quality_confirmed = 1
              AND bs.has_warehouse = 0
              AND (bs.has_packaging = 1 OR bs.has_defective_quality = 1)
         THEN 1 ELSE 0 END AS in_pending_warehouse,
    CASE WHEN bs.has_quality_confirmed = 1
              AND bs.has_packaging = 0
              AND bs.has_warehouse = 0
         THEN 1 ELSE 0 END AS in_pending_packaging
  FROM bundle_states bs
  LEFT JOIN t_production_order po ON po.id = bs.order_id
)
SELECT
  'A1_completed_order_in_pending' AS anomaly,
  COUNT(*) AS cnt
FROM readiness
WHERE (order_status IN ('closed','completed','cancelled','archived') OR delete_flag <> 0)
  AND (in_pending_qc = 1 OR in_pending_warehouse = 1 OR in_pending_packaging = 1)
UNION ALL
SELECT
  'A2_pending_warehouse_without_quality_confirm' AS anomaly,
  COUNT(*) AS cnt
FROM readiness
WHERE in_pending_warehouse = 1
  AND has_quality_confirmed = 0
UNION ALL
SELECT
  'A3_pending_warehouse_without_packaging_or_defect' AS anomaly,
  COUNT(*) AS cnt
FROM readiness
WHERE in_pending_warehouse = 1
  AND has_packaging = 0
  AND has_defective_quality = 0
UNION ALL
SELECT
  'A4_pending_qc_without_production' AS anomaly,
  COUNT(*) AS cnt
FROM readiness
WHERE in_pending_qc = 1
  AND has_production = 0;

-- 明细抽样（用于定位，最多 20 条）
WITH bundle_states AS (
  SELECT
    sr.order_id,
    sr.cutting_bundle_id,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'production' THEN 1 ELSE 0 END) AS has_production,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'quality' THEN 1 ELSE 0 END) AS has_quality,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'quality'
             AND sr.process_code = 'quality_receive' AND sr.confirm_time IS NOT NULL THEN 1 ELSE 0 END) AS has_quality_confirmed,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'quality'
             AND sr.process_code = 'quality_receive' AND sr.confirm_time IS NOT NULL
             AND sr.remark LIKE 'unqualified%' THEN 1 ELSE 0 END) AS has_defective_quality,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'warehouse'
             AND (sr.process_code IS NULL OR sr.process_code <> 'warehouse_rollback') THEN 1 ELSE 0 END) AS has_warehouse,
    MAX(CASE WHEN sr.scan_result = 'success' AND sr.scan_type = 'production' AND (
              LOWER(IFNULL(sr.process_code, '')) LIKE '%packaging%'
              OR sr.process_code IN ('包装','打包','入袋','后整','装箱','封箱','贴标','packing')
              OR sr.process_name IN ('包装','打包','入袋','后整','装箱','封箱','贴标','packing')
        ) THEN 1 ELSE 0 END) AS has_packaging
  FROM t_scan_record sr
  WHERE sr.cutting_bundle_id IS NOT NULL
    AND sr.cutting_bundle_id <> ''
  GROUP BY sr.order_id, sr.cutting_bundle_id
),
readiness AS (
  SELECT
    bs.order_id,
    bs.cutting_bundle_id,
    po.order_no,
    po.status AS order_status,
    po.delete_flag,
    bs.has_production,
    bs.has_quality,
    bs.has_quality_confirmed,
    bs.has_defective_quality,
    bs.has_packaging,
    bs.has_warehouse,
    CASE WHEN bs.has_production = 1 AND bs.has_quality = 0 THEN 1 ELSE 0 END AS in_pending_qc,
    CASE WHEN bs.has_quality_confirmed = 1
              AND bs.has_warehouse = 0
              AND (bs.has_packaging = 1 OR bs.has_defective_quality = 1)
         THEN 1 ELSE 0 END AS in_pending_warehouse,
    CASE WHEN bs.has_quality_confirmed = 1
              AND bs.has_packaging = 0
              AND bs.has_warehouse = 0
         THEN 1 ELSE 0 END AS in_pending_packaging
  FROM bundle_states bs
  LEFT JOIN t_production_order po ON po.id = bs.order_id
)
SELECT
  order_no,
  order_status,
  cutting_bundle_id,
  has_production,
  has_quality,
  has_quality_confirmed,
  has_packaging,
  has_defective_quality,
  has_warehouse,
  in_pending_qc,
  in_pending_packaging,
  in_pending_warehouse
FROM readiness
WHERE (order_status IN ('closed','completed','cancelled','archived') OR delete_flag <> 0)
  AND (in_pending_qc = 1 OR in_pending_warehouse = 1 OR in_pending_packaging = 1)
LIMIT 20;
