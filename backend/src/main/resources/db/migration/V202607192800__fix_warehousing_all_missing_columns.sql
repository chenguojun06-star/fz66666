-- V202607192800: 综合修复 t_product_warehousing 所有已知缺列风险
-- 背景：V202607192200 的 COMMENT '' 语法被 Flyway 截断，V202607192304 修复了部分列，
--       但 scan_mode / warehousing_start_time / warehousing_end_time /
--       quality_operator_id / quality_operator_name 仍可能在云端缺失。
-- 策略：全部使用 PREPARE + IF 幂等判断，不使用 COMMENT，确保列一定存在。

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='scan_mode')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `scan_mode` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_start_time')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `warehousing_start_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_end_time')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `warehousing_end_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='quality_operator_id')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `quality_operator_id` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='quality_operator_name')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `quality_operator_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_status')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_status` VARCHAR(30) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_operator_name')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_operator_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_completed_time')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_completed_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='unqualified_quantity')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `unqualified_quantity` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `t_product_warehousing` SET `scan_mode` = 'bundle' WHERE `scan_mode` IS NULL;

UPDATE `t_product_warehousing`
SET `repair_status` = 'pending_repair'
WHERE `unqualified_quantity` > 0
  AND (`repair_status` IS NULL OR `repair_status` = '')
  AND `delete_flag` = 0;
