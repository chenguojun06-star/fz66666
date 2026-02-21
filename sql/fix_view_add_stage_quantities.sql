-- 修复 v_production_order_flow_stage_snapshot 视图
-- 新增：car_sewing_quantity, ironing_quantity, secondary_process_quantity, packaging_quantity
-- 修复：secondary_process 从精确匹配 '二次工艺' 扩展为 LIKE 匹配 绣花/印花/二次

CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  sr.tenant_id AS tenant_id,

  -- 下单
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单'
      THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单'
      THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS order_operator_name,

  -- 采购
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购'
      THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS procurement_scan_operator_name,

  -- 裁剪
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'cutting'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,

  -- 缝制（排除质检/下单/采购）
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
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS sewing_operator_name,

  -- 车缝
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS car_sewing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%'
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS car_sewing_quantity,

  -- 大烫/整烫
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS ironing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%烫%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS ironing_quantity,

  -- 二次工艺（绣花/印花/二次）
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '二次工艺'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%绣花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%印花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%')
      THEN sr.scan_time END) AS secondary_process_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '二次工艺'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%绣花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%印花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%')
      THEN sr.scan_time END) AS secondary_process_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '二次工艺'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%绣花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%印花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS secondary_process_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '二次工艺'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%绣花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%印花%'
          OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,

  -- 包装
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS packaging_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS packaging_quantity,

  -- 质检
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
  SUBSTRING_INDEX(MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,

  -- 入库
  MIN(CASE WHEN sr.scan_type = 'warehouse'
        AND IFNULL(sr.process_code, '') <> 'warehouse_rollback'
      THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse'
        AND IFNULL(sr.process_code, '') <> 'warehouse_rollback'
      THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'warehouse'
        AND IFNULL(sr.process_code, '') <> 'warehouse_rollback'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END), '|', -1) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse'
        AND IFNULL(sr.process_code, '') <> 'warehouse_rollback'
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity

FROM t_scan_record sr
WHERE sr.scan_result = 'success'
GROUP BY sr.order_id, sr.tenant_id;
