-- =====================================================================
-- V202608081400 — 为金融实体表补加 version 列（乐观锁）
-- 背景：Payable/Receivable/BillAggregation/WagePayment 4 个金融实体
--       既无 @Version 乐观锁，也无原子 SQL 兜底，并发更新风险高（D-008 决策）
-- 策略：幂等 INFORMATION_SCHEMA + PREPARE/EXECUTE，禁止 COMMENT 子句
-- =====================================================================

-- ===== t_payable =====
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_payable' AND COLUMN_NAME = 'version') = 0,
    'ALTER TABLE `t_payable` ADD COLUMN `version` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== t_receivable =====
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_receivable' AND COLUMN_NAME = 'version') = 0,
    'ALTER TABLE `t_receivable` ADD COLUMN `version` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== t_bill_aggregation =====
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_bill_aggregation' AND COLUMN_NAME = 'version') = 0,
    'ALTER TABLE `t_bill_aggregation` ADD COLUMN `version` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== t_wage_payment =====
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_wage_payment' AND COLUMN_NAME = 'version') = 0,
    'ALTER TABLE `t_wage_payment` ADD COLUMN `version` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
