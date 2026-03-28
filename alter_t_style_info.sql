-- alter_t_style_info.sql
-- 幂等地为 t_style_info 添加缺失列（安全，无 COMMENT 在动态 SQL 中）
-- 建议先备份 t_style_info 表再执行

-- add fabric_composition
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='fabric_composition')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add wash_instructions
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='wash_instructions')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `wash_instructions` VARCHAR(500) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- add u_code
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='u_code')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `u_code` VARCHAR(100) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- wash-care code fields
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='wash_temp_code')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `wash_temp_code` VARCHAR(20) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='bleach_code')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `bleach_code` VARCHAR(20) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='tumble_dry_code')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `tumble_dry_code` VARCHAR(20) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='iron_code')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `iron_code` VARCHAR(20) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='dry_clean_code')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `dry_clean_code` VARCHAR(20) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- fabric_composition_parts
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='fabric_composition_parts')=0,
            'ALTER TABLE `t_style_info` ADD COLUMN `fabric_composition_parts` VARCHAR(1000) DEFAULT NULL',
            'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- End of script
