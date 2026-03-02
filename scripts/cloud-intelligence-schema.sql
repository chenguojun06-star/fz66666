-- ============================================================
-- 云端智能化模块数据库补全脚本
-- 执行环境：微信云托管控制台 → 数据库面板
-- 说明：FLYWAY_ENABLED=false，以下 Flyway 脚本不会自动执行，需手动运行
-- 日期：2026-03-02
-- ============================================================

-- ============================
-- 1. 视图：v_production_order_flow_stage_snapshot
--    依赖方：RhythmDnaOrchestrator
--    来源：V2026022601__sync_flow_stage_view_latest.sql
-- ============================

CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  sr.tenant_id AS tenant_id,
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS order_operator_name,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS procurement_scan_operator_name,
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
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
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
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
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS car_sewing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS car_sewing_quantity,
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
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
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
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS secondary_process_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,
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
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
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
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
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
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
GROUP BY sr.order_id, sr.tenant_id;


-- ============================
-- 2. 视图：v_production_order_stage_done_agg
--    依赖方：BottleneckDetectionOrchestrator, ProgressPredictOrchestrator, OrderDeliveryRiskOrchestrator
--    来源：init.sql
-- ============================

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


-- ============================
-- 3. 表：t_intelligence_process_stats
--    依赖方：ProgressPredictOrchestrator, OrderDeliveryRiskOrchestrator, LearningReportOrchestrator, IntelligenceLearningJob
--    来源：V20260227a__create_intelligence_tables.sql
-- ============================

CREATE TABLE IF NOT EXISTS t_intelligence_process_stats (
    id                       VARCHAR(64)    NOT NULL PRIMARY KEY,
    tenant_id                BIGINT                          COMMENT '租户ID',
    stage_name               VARCHAR(100)   NOT NULL         COMMENT '工序阶段名称（对应 progress_stage）',
    scan_type                VARCHAR(50)    NOT NULL         COMMENT '扫码类型（production/quality/warehouse等）',
    sample_count             INT            NOT NULL DEFAULT 0 COMMENT '样本量：参与统计的订单数',
    avg_minutes_per_unit     DECIMAL(10,3)                   COMMENT '每件平均耗时（分钟）',
    min_minutes_per_unit     DECIMAL(10,3)                   COMMENT '每件最短耗时（分钟）',
    max_minutes_per_unit     DECIMAL(10,3)                   COMMENT '每件最长耗时（分钟）',
    avg_stage_total_minutes  DECIMAL(12,3)                   COMMENT '该阶段整体平均耗时（分钟）',
    confidence_score         DECIMAL(4,3)   NOT NULL DEFAULT 0.40 COMMENT '置信度 0~1',
    last_computed_time       DATETIME                        COMMENT '最后一次计算时间',
    create_time              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_stage_type (tenant_id, stage_name, scan_type),
    INDEX idx_tenant_stage (tenant_id, stage_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能编排-工序耗时统计';


-- ============================
-- 4. 表：t_intelligence_prediction_log
--    依赖方：ProgressPredictOrchestrator, FeedbackLearningOrchestrator, LearningReportOrchestrator
--    来源：V20260227a__create_intelligence_tables.sql
-- ============================

CREATE TABLE IF NOT EXISTS t_intelligence_prediction_log (
    id                    VARCHAR(64)   NOT NULL PRIMARY KEY,
    tenant_id             BIGINT                          COMMENT '租户ID',
    prediction_id         VARCHAR(64)   NOT NULL         COMMENT '预测唯一ID',
    order_id              VARCHAR(64)                     COMMENT '订单ID',
    order_no              VARCHAR(100)                    COMMENT '订单号',
    stage_name            VARCHAR(100)                    COMMENT '工序阶段',
    process_name          VARCHAR(100)                    COMMENT '子工序名',
    current_progress      INT                             COMMENT '预测时的当前进度（0-100）',
    predicted_finish_time DATETIME                        COMMENT '模型预测的完成时间',
    actual_finish_time    DATETIME                        COMMENT '实际完成时间（反馈后回填）',
    confidence            DECIMAL(4,3)                    COMMENT '本次预测使用的置信度',
    deviation_minutes     BIGINT                          COMMENT '偏差分钟数',
    feedback_accepted     TINYINT(1)                      COMMENT '用户是否采纳建议',
    sample_count          INT                             COMMENT '预测时使用的样本量',
    algorithm_version     VARCHAR(20)   DEFAULT 'rule_v1' COMMENT '算法版本',
    create_time           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_prediction_id (prediction_id),
    INDEX idx_order_stage (order_id, stage_name),
    INDEX idx_tenant_create (tenant_id, create_time),
    INDEX idx_deviation (tenant_id, deviation_minutes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能编排-预测日志与反馈';

