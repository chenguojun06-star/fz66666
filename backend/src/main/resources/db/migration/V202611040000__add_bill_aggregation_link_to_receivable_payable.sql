-- 应付/应收任务与账单汇总关联字段

-- t_payable.bill_aggregation_id
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'bill_aggregation_id') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `bill_aggregation_id` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- t_receivable.bill_aggregation_id
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_receivable'
       AND COLUMN_NAME = 'bill_aggregation_id') = 0,
    'ALTER TABLE `t_receivable` ADD COLUMN `bill_aggregation_id` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 索引：便于按 billAggregationId 快速回写与查询
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND INDEX_NAME = 'idx_payable_bill_aggregation_id') = 0,
    'CREATE INDEX `idx_payable_bill_aggregation_id` ON `t_payable`(`bill_aggregation_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_receivable'
       AND INDEX_NAME = 'idx_receivable_bill_aggregation_id') = 0,
    'CREATE INDEX `idx_receivable_bill_aggregation_id` ON `t_receivable`(`bill_aggregation_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
