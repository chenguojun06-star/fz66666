-- 向 t_payroll_settlement_item 添加颜色/尺码/工序码/菲号字段
-- 原版本使用 DELIMITER $$ 存储过程方式，云端 MySQL 用户可能无 CREATE ROUTINE 权限导致 502
-- 已重写为 INFORMATION_SCHEMA 幂等模式（validate-on-migrate=false 允许对 success=0 记录安全重执行）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement_item' AND COLUMN_NAME='color')=0,
  'ALTER TABLE `t_payroll_settlement_item` ADD COLUMN `color` VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement_item' AND COLUMN_NAME='size')=0,
  'ALTER TABLE `t_payroll_settlement_item` ADD COLUMN `size` VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement_item' AND COLUMN_NAME='process_code')=0,
  'ALTER TABLE `t_payroll_settlement_item` ADD COLUMN `process_code` VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement_item' AND COLUMN_NAME='cutting_bundle_no')=0,
  'ALTER TABLE `t_payroll_settlement_item` ADD COLUMN `cutting_bundle_no` INT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
