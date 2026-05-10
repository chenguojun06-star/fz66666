SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'bill_type') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `bill_type` VARCHAR(20) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'bill_category') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `bill_category` VARCHAR(32) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'source_type') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `source_type` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'source_id') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `source_id` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'source_no') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `source_no` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'counterparty_type') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `counterparty_type` VARCHAR(32) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'counterparty_id') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `counterparty_id` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'counterparty_name') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `counterparty_name` VARCHAR(200) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'style_no') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `style_no` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'settlement_month') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `settlement_month` VARCHAR(7) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND COLUMN_NAME = 'bill_count') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `bill_count` INT NULL DEFAULT 1',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_payable'
       AND INDEX_NAME = 'idx_payable_source') = 0,
    'CREATE INDEX `idx_payable_source` ON `t_payable`(`source_type`, `source_id`)',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_bill_aggregation'
       AND COLUMN_NAME = 'payable_id') = 0,
    'ALTER TABLE `t_bill_aggregation` ADD COLUMN `payable_id` VARCHAR(64) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
