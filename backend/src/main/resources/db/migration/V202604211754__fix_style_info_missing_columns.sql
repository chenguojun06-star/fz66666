-- 补偿脚本：修复 V20260427002 和 V20260428001 因 COMMENT 在动态 SQL 内导致的 Flyway silent failure
-- 云端 t_style_info 缺少 8 个列，导致款式列表/费用统计接口全部 500
-- 注意：SET @s = IF(...) 块内的 SQL 字符串严禁使用 COMMENT（Flyway 解析器会截断，导致 ALTER TABLE 从不执行）

-- 1. fabric_composition
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='fabric_composition') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. wash_instructions
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='wash_instructions') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `wash_instructions` VARCHAR(500) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. u_code
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='u_code') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `u_code` VARCHAR(100) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. wash_temp_code
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='wash_temp_code') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `wash_temp_code` VARCHAR(20) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. bleach_code
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='bleach_code') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `bleach_code` VARCHAR(20) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. tumble_dry_code
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='tumble_dry_code') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `tumble_dry_code` VARCHAR(20) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. iron_code
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='iron_code') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `iron_code` VARCHAR(20) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. dry_clean_code
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='dry_clean_code') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `dry_clean_code` VARCHAR(20) DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
