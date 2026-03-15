-- 云端 t_production_order 核对脚本（2026-03-16）
-- 目标：快速判断首页 /api/dashboard/daily-brief 与 /api/dashboard/urgent-events
-- 是否因为 t_production_order 缺列而 500，并顺手盘点订单实体高风险扩展列。

SELECT 'step-1: table existence' AS step;

SELECT
  't_production_order' AS table_name,
  CASE WHEN COUNT(*) > 0 THEN 'OK' ELSE 'MISSING_TABLE' END AS status
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_production_order';


SELECT 'step-2: dashboard core columns (缺这些列会直接影响首页日报/紧急事件)' AS step;

SELECT
  expected.column_name,
  expected.expected_type,
  CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(actual.COLUMN_TYPE, '') AS actual_type,
  COALESCE(actual.IS_NULLABLE, '') AS is_nullable,
  COALESCE(CAST(actual.COLUMN_DEFAULT AS CHAR), '') AS column_default
FROM (
  SELECT 1 AS sort_order, 'id' AS column_name, 'varchar/char uuid' AS expected_type
  UNION ALL SELECT 2, 'order_no', 'varchar'
  UNION ALL SELECT 3, 'style_no', 'varchar'
  UNION ALL SELECT 4, 'factory_name', 'varchar'
  UNION ALL SELECT 5, 'production_progress', 'int'
  UNION ALL SELECT 6, 'planned_end_date', 'datetime'
  UNION ALL SELECT 7, 'status', 'varchar'
  UNION ALL SELECT 8, 'delete_flag', 'int/tinyint'
  UNION ALL SELECT 9, 'create_time', 'datetime'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_production_order'
 AND actual.COLUMN_NAME = expected.column_name
ORDER BY expected.sort_order;


SELECT 'step-3: high-risk entity extension columns (缺这些列会拖垮仍在全字段 SELECT 的订单接口)' AS step;

SELECT
  expected.column_name,
  expected.origin,
  CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(actual.COLUMN_TYPE, '') AS actual_type
FROM (
  SELECT 1 AS sort_order, 'progress_workflow_json' AS column_name, 'V20260418001 / 订单工序流程' AS origin
  UNION ALL SELECT 2, 'progress_workflow_locked', 'V20260418001 / 订单工序流程'
  UNION ALL SELECT 3, 'progress_workflow_locked_at', 'V20260418001 / 订单工序流程'
  UNION ALL SELECT 4, 'progress_workflow_locked_by', 'V20260418001 / 订单工序流程'
  UNION ALL SELECT 5, 'progress_workflow_locked_by_name', 'V20260418001 / 订单工序流程'
  UNION ALL SELECT 6, 'skc', 'V20260309 / SKC统一编号'
  UNION ALL SELECT 7, 'factory_contact_person', 'V20260420001 / 工厂联系人快照'
  UNION ALL SELECT 8, 'factory_contact_phone', 'V20260420001 / 工厂联系电话快照'
  UNION ALL SELECT 9, 'customer_id', 'V20260319 / CRM客户关联'
  UNION ALL SELECT 10, 'remarks', 'V20260419001 / 订单备注'
  UNION ALL SELECT 11, 'expected_ship_date', 'V20260419001 / 预计出货日期'
  UNION ALL SELECT 12, 'node_operations', 'V20260419001 / 节点操作记录'
  UNION ALL SELECT 13, 'version', 'V20260221b / 乐观锁版本'
  UNION ALL SELECT 14, 'order_biz_type', 'V20260313 / 下单业务类型'
  UNION ALL SELECT 15, 'org_unit_id', 'V20260307 / 组织架构快照'
  UNION ALL SELECT 16, 'parent_org_unit_id', 'V20260307 / 组织架构快照'
  UNION ALL SELECT 17, 'parent_org_unit_name', 'V20260307 / 组织架构快照'
  UNION ALL SELECT 18, 'org_path', 'V20260307 / 组织架构快照'
  UNION ALL SELECT 19, 'factory_type', 'V20260307 / 工厂内外标签'
  UNION ALL SELECT 20, 'procurement_manually_completed', 'V42 / 采购确认'
  UNION ALL SELECT 21, 'procurement_confirmed_by', 'V42 / 采购确认'
  UNION ALL SELECT 22, 'procurement_confirmed_by_name', 'V42 / 采购确认'
  UNION ALL SELECT 23, 'procurement_confirmed_at', 'V20260419001 / 采购确认时间'
  UNION ALL SELECT 24, 'procurement_confirm_remark', 'V20260419001 / 采购确认备注'
  UNION ALL SELECT 25, 'urgency_level', 'V2026022603 / 紧急程度'
  UNION ALL SELECT 26, 'plate_type', 'V2026022604 / 首单翻单'
  UNION ALL SELECT 27, 'tenant_id', 'V20260221b / 多租户'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_production_order'
 AND actual.COLUMN_NAME = expected.column_name
ORDER BY expected.sort_order;


SELECT 'step-4: missing column summary' AS step;

SELECT
  CASE
    WHEN missing_group = 'dashboard-core' THEN '首页日报/紧急事件直接受影响'
    ELSE '其他订单接口存在潜在风险'
  END AS impact,
  GROUP_CONCAT(column_name ORDER BY sort_order SEPARATOR ', ') AS missing_columns
FROM (
  SELECT 1 AS sort_order, 'dashboard-core' AS missing_group, 'id' AS column_name
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'id'
  )
  UNION ALL SELECT 2, 'dashboard-core', 'order_no'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'order_no'
  )
  UNION ALL SELECT 3, 'dashboard-core', 'style_no'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'style_no'
  )
  UNION ALL SELECT 4, 'dashboard-core', 'factory_name'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'factory_name'
  )
  UNION ALL SELECT 5, 'dashboard-core', 'production_progress'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'production_progress'
  )
  UNION ALL SELECT 6, 'dashboard-core', 'planned_end_date'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'planned_end_date'
  )
  UNION ALL SELECT 7, 'dashboard-core', 'status'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'status'
  )
  UNION ALL SELECT 8, 'dashboard-core', 'delete_flag'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'delete_flag'
  )
  UNION ALL SELECT 9, 'dashboard-core', 'create_time'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'create_time'
  )
  UNION ALL SELECT 101, 'entity-extension', 'progress_workflow_json'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_json'
  )
  UNION ALL SELECT 102, 'entity-extension', 'progress_workflow_locked'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked'
  )
  UNION ALL SELECT 103, 'entity-extension', 'progress_workflow_locked_at'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked_at'
  )
  UNION ALL SELECT 104, 'entity-extension', 'progress_workflow_locked_by'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked_by'
  )
  UNION ALL SELECT 105, 'entity-extension', 'progress_workflow_locked_by_name'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'progress_workflow_locked_by_name'
  )
  UNION ALL SELECT 106, 'entity-extension', 'skc'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'skc'
  )
  UNION ALL SELECT 107, 'entity-extension', 'factory_contact_person'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'factory_contact_person'
  )
  UNION ALL SELECT 108, 'entity-extension', 'factory_contact_phone'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'factory_contact_phone'
  )
  UNION ALL SELECT 109, 'entity-extension', 'customer_id'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'customer_id'
  )
  UNION ALL SELECT 110, 'entity-extension', 'remarks'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'remarks'
  )
  UNION ALL SELECT 111, 'entity-extension', 'expected_ship_date'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'expected_ship_date'
  )
  UNION ALL SELECT 112, 'entity-extension', 'node_operations'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'node_operations'
  )
  UNION ALL SELECT 113, 'entity-extension', 'version'
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND COLUMN_NAME = 'version'
  )
) missing
GROUP BY missing_group;


SELECT 'step-5: relevant flyway history (若这些版本未成功，说明云端结构大概率没补齐)' AS step;

SELECT version, description, script, success, installed_on
FROM flyway_schema_history
WHERE version IN (
  '42',
  '2026022603',
  '2026022604',
  '20260307',
  '20260309',
  '20260313',
  '20260319',
  '20260418001',
  '20260419001',
  '20260420001',
  '20260424001'
)
ORDER BY installed_rank;


SELECT 'step-6: performance index check (不是500根因，但影响首页性能)' AS step;

SHOW INDEX FROM t_production_order WHERE Key_name = 'idx_production_order_status_flag';


SELECT 'cloud-db-production-order-dashboard-verify-20260316 finished' AS message;
