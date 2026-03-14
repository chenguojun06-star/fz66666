-- V20260418001__add_production_order_workflow_fields.sql
-- Purpose: Add progress_workflow_* columns to t_production_order.
--          These 5 columns were added to the entity and local DB manually
--          but were never covered by any Flyway migration script.
--          Cloud DB is missing them → INSERT with progressWorkflowJson (non-null)
--          causes a runtime exception → HTTP 500 "系统内部错误" on 下单.
-- Idempotent: uses INFORMATION_SCHEMA SET @s / PREPARE / EXECUTE pattern.
-- Safe for repeated execution (Flyway checksum protects against re-runs anyway).

-- 1. progress_workflow_json (LONGTEXT, nullable)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'progress_workflow_json') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_json` LONGTEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. progress_workflow_locked (INT NOT NULL DEFAULT 0, 0=未锁定 1=已锁定)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'progress_workflow_locked') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked` INT NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. progress_workflow_locked_at (DATETIME, nullable)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'progress_workflow_locked_at') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked_at` DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. progress_workflow_locked_by (VARCHAR 36, nullable — stores operator user ID)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'progress_workflow_locked_by') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked_by` VARCHAR(36) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. progress_workflow_locked_by_name (VARCHAR 50, nullable — stores operator display name)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'progress_workflow_locked_by_name') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked_by_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
