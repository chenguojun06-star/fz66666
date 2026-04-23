-- 交付SLA与快反模式：向 t_production_order 添加交付管理字段
-- 幂等写法 INFORMATION_SCHEMA（MySQL 8.0 不支持 IF NOT EXISTS）

-- is_quick_response: 是否快反订单 0=否 1=是
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='is_quick_response')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `is_quick_response` TINYINT(1) DEFAULT 0 AFTER `plate_type`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- standard_delivery_days: 标准交付天数(SLA)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='standard_delivery_days')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `standard_delivery_days` INT DEFAULT NULL AFTER `is_quick_response`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- actual_delivery_days: 实际交付天数(自动计算)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='actual_delivery_days')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `actual_delivery_days` INT DEFAULT NULL AFTER `standard_delivery_days`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- delivery_sla_status: SLA状态 on_track/at_risk/breached/completed
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='delivery_sla_status')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `delivery_sla_status` VARCHAR(32) DEFAULT NULL AFTER `actual_delivery_days`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
