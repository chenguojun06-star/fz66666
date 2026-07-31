-- 工资结算：记录本次结算包含的扫码记录ID，用于取消/反向审核时精确回滚 tracking 结算状态
-- 修复：PayrollSettlementOrchestrator.cancel/reverseApprove 未回滚 ProductionProcessTracking.isSettled
-- 根因：syncTrackingSettlementState 用宽泛条件（orderId+operatorId+时间窗）标记，无法精确反查本次结算包含的 tracking 记录
-- 方案：在 t_payroll_settlement 存 scan_record_ids（逗号分隔的扫码记录ID），取消/反向时按 ID 精确回滚

-- 先检查列是否已存在（幂等）
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_payroll_settlement'
    AND COLUMN_NAME = 'scan_record_ids'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE t_payroll_settlement ADD COLUMN scan_record_ids TEXT NULL AFTER remark',
  'SELECT ''scan_record_ids already exists'' AS msg'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
