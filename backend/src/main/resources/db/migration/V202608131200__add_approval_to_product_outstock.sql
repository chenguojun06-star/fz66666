-- 成品出库增加审批流程字段
-- approval_status: pending(待审批) / approved(已审批) / rejected(已驳回)

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='approval_status')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `approval_status` VARCHAR(20) DEFAULT ''pending''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='approve_by')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `approve_by` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='approve_by_name')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `approve_by_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='approve_time')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `approve_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 存量出库记录设为已审批（历史数据兼容）
UPDATE `t_product_outstock` SET `approval_status` = 'approved' WHERE `approval_status` IS NULL OR `approval_status` = '';
