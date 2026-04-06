-- 出库单新增收货字段（外发工厂发货后，内部确认收货）
-- receive_status: pending(待收货) / received(已收货)

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='receive_status')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `receive_status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='receive_time')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `receive_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='received_by')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `received_by` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='received_by_name')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `received_by_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填已有出库记录为"待收货"状态
UPDATE `t_product_outstock` SET `receive_status` = 'pending' WHERE `receive_status` IS NULL;
