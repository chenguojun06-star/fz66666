-- V202607191600: 供应商采购初审工作流字段
-- 为 t_material_purchase 添加初审状态相关字段，支持 completed→pending_audit→passed→对账单 工作流

SET @s1 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_status')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_status` VARCHAR(32) DEFAULT NULL COMMENT ''初审状态: pending_audit=待初审 passed=初审通过 rejected=初审驳回''',
    'SELECT 1');
PREPARE stmt FROM @s1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s2 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_reason')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_reason` VARCHAR(500) DEFAULT NULL COMMENT ''初审驳回原因''',
    'SELECT 1');
PREPARE stmt FROM @s2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s3 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_time')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_time` DATETIME DEFAULT NULL COMMENT ''初审操作时间''',
    'SELECT 1');
PREPARE stmt FROM @s3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s4 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_operator_id')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_operator_id` VARCHAR(64) DEFAULT NULL COMMENT ''初审操作人ID''',
    'SELECT 1');
PREPARE stmt FROM @s4; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s5 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_operator_name')=0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_operator_name` VARCHAR(100) DEFAULT NULL COMMENT ''初审操作人姓名''',
    'SELECT 1');
PREPARE stmt FROM @s5; EXECUTE stmt; DEALLOCATE PREPARE stmt;
