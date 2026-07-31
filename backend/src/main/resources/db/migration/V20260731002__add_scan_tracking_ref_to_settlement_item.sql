-- 工资结算明细：补充 scanRecordIds / trackingIds 关联，实现明细级精确追溯与回滚
-- 修复：PayrollSettlementItem 缺少对 ScanRecord / ProductionProcessTracking 的直接引用，
--       导致明细维度无法精确定位到单条扫码记录或 tracking 记录，只能依赖主表 scan_record_ids 或宽泛条件
-- 方案：新增 scan_record_ids 和 tracking_ids 列（复数，逗号分隔，与 Entity scanRecordIds/trackingIds 对齐）

SET @col_scan := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_payroll_settlement_item'
    AND COLUMN_NAME = 'scan_record_ids'
);

SET @ddl_scan := IF(
  @col_scan = 0,
  'ALTER TABLE t_payroll_settlement_item ADD COLUMN scan_record_ids VARCHAR(512) NULL AFTER scan_type',
  'SELECT ''scan_record_ids already exists'' AS msg'
);

PREPARE stmt_scan FROM @ddl_scan;
EXECUTE stmt_scan;
DEALLOCATE PREPARE stmt_scan;

SET @col_tracking := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_payroll_settlement_item'
    AND COLUMN_NAME = 'tracking_ids'
);

SET @ddl_tracking := IF(
  @col_tracking = 0,
  'ALTER TABLE t_payroll_settlement_item ADD COLUMN tracking_ids VARCHAR(512) NULL AFTER scan_record_ids',
  'SELECT ''tracking_ids already exists'' AS msg'
);

PREPARE stmt_tracking FROM @ddl_tracking;
EXECUTE stmt_tracking;
DEALLOCATE PREPARE stmt_tracking;
