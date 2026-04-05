-- Fix: t_style_attachment is missing 5 columns that the StyleAttachment entity maps to:
-- version, version_remark, status, parent_id, tenant_id.
-- When MyBatis-Plus INSERT includes these non-null entity fields, MySQL throws
-- "Unknown column 'version' in 'field list'" which surfaces as
-- StyleAttachmentMapper.insert-Inline "error occurred while setting parameters".
-- Also: getLatestPattern() WHERE status=? ORDER BY version would fail on SELECT too.
-- All 5 ADD COLUMN statements are idempotent (INFORMATION_SCHEMA guard, no COMMENT in @s string).

-- 1. version (INT)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='version')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `version` INT DEFAULT 1',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. version_remark (VARCHAR 200)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='version_remark')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `version_remark` VARCHAR(200) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. status (VARCHAR 20, default active)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='status')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `status` VARCHAR(20) DEFAULT ''active''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. parent_id (VARCHAR 36)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='parent_id')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `parent_id` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. tenant_id (BIGINT) — filled via @TableField(fill = FieldFill.INSERT)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Backfill: set status=active for existing rows that have NULL status
UPDATE `t_style_attachment` SET `status` = 'active' WHERE `status` IS NULL;
