-- V42: 添加采购确认字段到生产订单表（MindPush 面料检测依赖）
-- 幂等写法：使用 INFORMATION_SCHEMA 判断列是否存在

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_manually_completed')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_manually_completed` INT DEFAULT 0 COMMENT ''采购是否手动确认完成 0=未确认 1=已确认''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_by` VARCHAR(64) DEFAULT NULL COMMENT ''采购确认人ID''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_by_name` VARCHAR(100) DEFAULT NULL COMMENT ''采购确认人姓名''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
