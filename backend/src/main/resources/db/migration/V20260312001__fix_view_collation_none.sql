-- V20260312001: 修复三个生产视图的 Collation NONE 报错
-- 问题根因：CONVERT(... USING utf8mb4) 不加 COLLATE 会产生 NONE 可强制性（coercibility 6），
--         MAX() 对两个 NONE 强制性值比较时 MySQL 8.0 抛出：
--         Illegal mix of collations (utf8mb4_bin,NONE) and (utf8mb4_bin,NONE) for operation 'max'
-- 为什么 Flyway 是唯一可靠修复路径：
--   cloudbaserc.json 中 FASHION_DB_INITIALIZER_ENABLED=false + application-prod.yml initializer-enabled=false
--   导致 DataInitializer Bean 在云端从未实例化，ViewMigrator.initialize() 从未执行。
--   Flyway (FLYWAY_ENABLED=true) 是唯一能在云端自动更新视图定义的机制。
-- 修复内容：三个视图的所有 CONVERT(... USING utf8mb4) 表达式均加上 COLLATE utf8mb4_bin，
--   将强制性从 6(NONE) 提升到 0(EXPLICIT)，彻底消除 MAX() 对多行聚合时的冲突。
-- SQL 内容与 ViewMigrator.java ensureProductionViewsFallback() 内联 SQL 完全一致（同步维护）。

-- ① v_production_order_flow_stage_snapshot
CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  sr.tenant_id AS tenant_id,
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS order_operator_name,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS procurement_scan_operator_name,
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS sewing_operator_name,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS car_sewing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS car_sewing_quantity,
  -- ironing_* 列实际存「尾部」父节点聚合（大烫/整烫/剪线/包装/尾工均归尾部）
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS ironing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS ironing_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN sr.scan_time END) AS secondary_process_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN sr.scan_time END) AS secondary_process_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS secondary_process_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,
  -- packaging_* 列实际存「尾部」父节点聚合（与 ironing_* 值相同）
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS packaging_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS packaging_quantity,
  MIN(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_start_time,
  MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) USING utf8mb4) COLLATE utf8mb4_bin END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
GROUP BY sr.order_id, sr.tenant_id;

-- ② v_production_order_stage_done_agg
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
    AND sr.scan_type IN ('production', 'cutting')
) t
WHERE t.stage_name IS NOT NULL AND t.stage_name <> ''
GROUP BY t.order_id, t.tenant_id, t.stage_name;

-- ③ v_production_order_procurement_snapshot
CREATE OR REPLACE VIEW v_production_order_procurement_snapshot AS
SELECT
  p.order_id AS order_id,
  p.tenant_id AS tenant_id,
  MIN(p.create_time) AS procurement_start_time,
  MAX(COALESCE(p.received_time, p.update_time)) AS procurement_end_time,
  SUBSTRING_INDEX(
    MAX(CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(COALESCE(p.received_time, p.update_time)), 20, '0'), LPAD(UNIX_TIMESTAMP(p.update_time), 20, '0'), '|', IFNULL(p.receiver_name, '')) USING utf8mb4) COLLATE utf8mb4_bin),
    '|', -1
  ) AS procurement_operator_name,
  SUM(IFNULL(p.purchase_quantity, 0)) AS purchase_quantity,
  SUM(IFNULL(p.arrived_quantity, 0)) AS arrived_quantity
FROM t_material_purchase p
WHERE p.delete_flag = 0
  AND p.order_id IS NOT NULL
  AND p.order_id <> ''
GROUP BY p.order_id, p.tenant_id;
