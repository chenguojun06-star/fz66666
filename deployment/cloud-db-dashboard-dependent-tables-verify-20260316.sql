-- 云端 dashboard 依赖表二轮核对脚本（2026-03-16）
-- 目标：继续排查首页 dashboard 非 t_production_order 类 500 风险。
-- 覆盖表：t_style_info / t_scan_record / t_material_purchase / t_product_warehousing

SELECT 'step-1: dashboard dependent table existence' AS step;

SELECT
  expected.table_name,
  CASE WHEN actual.TABLE_NAME IS NULL THEN 'MISSING_TABLE' ELSE 'OK' END AS status
FROM (
  SELECT 't_style_info' AS table_name
  UNION ALL SELECT 't_scan_record'
  UNION ALL SELECT 't_material_purchase'
  UNION ALL SELECT 't_product_warehousing'
) expected
LEFT JOIN INFORMATION_SCHEMA.TABLES actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = expected.table_name
ORDER BY expected.table_name;


SELECT 'step-2: t_style_info core columns (首页动态/顶部样衣统计依赖)' AS step;

SELECT
  expected.column_name,
  CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(actual.COLUMN_TYPE, '') AS actual_type
FROM (
  SELECT 1 AS sort_order, 'id' AS column_name
  UNION ALL SELECT 2, 'style_no'
  UNION ALL SELECT 3, 'status'
  UNION ALL SELECT 4, 'create_time'
  UNION ALL SELECT 5, 'sample_status'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_style_info'
 AND actual.COLUMN_NAME = expected.column_name
ORDER BY expected.sort_order;


SELECT 'step-3: t_scan_record core columns (首页动态/扫码图表/日报扫描统计依赖)' AS step;

SELECT
  expected.column_name,
  CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(actual.COLUMN_TYPE, '') AS actual_type
FROM (
  SELECT 1 AS sort_order, 'id' AS column_name
  UNION ALL SELECT 2, 'order_no'
  UNION ALL SELECT 3, 'scan_time'
  UNION ALL SELECT 4, 'operator_name'
  UNION ALL SELECT 5, 'operator_id'
  UNION ALL SELECT 6, 'scan_result'
  UNION ALL SELECT 7, 'quantity'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_scan_record'
 AND actual.COLUMN_NAME = expected.column_name
ORDER BY expected.sort_order;


SELECT 'step-4: t_material_purchase core columns (首页动态/紧急事件统计依赖)' AS step;

SELECT
  expected.column_name,
  CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(actual.COLUMN_TYPE, '') AS actual_type
FROM (
  SELECT 1 AS sort_order, 'id' AS column_name
  UNION ALL SELECT 2, 'purchase_no'
  UNION ALL SELECT 3, 'status'
  UNION ALL SELECT 4, 'delete_flag'
  UNION ALL SELECT 5, 'create_time'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_material_purchase'
 AND actual.COLUMN_NAME = expected.column_name
ORDER BY expected.sort_order;


SELECT 'step-5: t_product_warehousing core columns (日报入库/质检统计/顶部入库统计依赖)' AS step;

SELECT
  expected.column_name,
  CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(actual.COLUMN_TYPE, '') AS actual_type
FROM (
  SELECT 1 AS sort_order, 'delete_flag' AS column_name
  UNION ALL SELECT 2, 'create_time'
  UNION ALL SELECT 3, 'warehousing_end_time'
  UNION ALL SELECT 4, 'qualified_quantity'
  UNION ALL SELECT 5, 'unqualified_quantity'
  UNION ALL SELECT 6, 'defect_remark'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_product_warehousing'
 AND actual.COLUMN_NAME = expected.column_name
ORDER BY expected.sort_order;


SELECT 'step-6: dashboard dependent table missing summary' AS step;

SELECT 't_style_info' AS table_name,
       GROUP_CONCAT(expected.column_name ORDER BY expected.sort_order SEPARATOR ', ') AS missing_columns
FROM (
  SELECT 1 AS sort_order, 'id' AS column_name
  UNION ALL SELECT 2, 'style_no'
  UNION ALL SELECT 3, 'status'
  UNION ALL SELECT 4, 'create_time'
  UNION ALL SELECT 5, 'sample_status'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_style_info'
 AND actual.COLUMN_NAME = expected.column_name
WHERE actual.COLUMN_NAME IS NULL

UNION ALL

SELECT 't_scan_record' AS table_name,
       GROUP_CONCAT(expected.column_name ORDER BY expected.sort_order SEPARATOR ', ') AS missing_columns
FROM (
  SELECT 1 AS sort_order, 'id' AS column_name
  UNION ALL SELECT 2, 'order_no'
  UNION ALL SELECT 3, 'scan_time'
  UNION ALL SELECT 4, 'operator_name'
  UNION ALL SELECT 5, 'operator_id'
  UNION ALL SELECT 6, 'scan_result'
  UNION ALL SELECT 7, 'quantity'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_scan_record'
 AND actual.COLUMN_NAME = expected.column_name
WHERE actual.COLUMN_NAME IS NULL

UNION ALL

SELECT 't_material_purchase' AS table_name,
       GROUP_CONCAT(expected.column_name ORDER BY expected.sort_order SEPARATOR ', ') AS missing_columns
FROM (
  SELECT 1 AS sort_order, 'id' AS column_name
  UNION ALL SELECT 2, 'purchase_no'
  UNION ALL SELECT 3, 'status'
  UNION ALL SELECT 4, 'delete_flag'
  UNION ALL SELECT 5, 'create_time'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_material_purchase'
 AND actual.COLUMN_NAME = expected.column_name
WHERE actual.COLUMN_NAME IS NULL

UNION ALL

SELECT 't_product_warehousing' AS table_name,
       GROUP_CONCAT(expected.column_name ORDER BY expected.sort_order SEPARATOR ', ') AS missing_columns
FROM (
  SELECT 1 AS sort_order, 'delete_flag' AS column_name
  UNION ALL SELECT 2, 'create_time'
  UNION ALL SELECT 3, 'warehousing_end_time'
  UNION ALL SELECT 4, 'qualified_quantity'
  UNION ALL SELECT 5, 'unqualified_quantity'
  UNION ALL SELECT 6, 'defect_remark'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_product_warehousing'
 AND actual.COLUMN_NAME = expected.column_name
WHERE actual.COLUMN_NAME IS NULL;


SELECT 'cloud-db-dashboard-dependent-tables-verify-20260316 finished' AS message;
