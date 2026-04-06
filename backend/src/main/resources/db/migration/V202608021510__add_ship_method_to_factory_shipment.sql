-- 发货方式字段：SELF_DELIVERY(自发货) / EXPRESS(快递)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment' AND COLUMN_NAME='ship_method')=0,
    'ALTER TABLE `t_factory_shipment` ADD COLUMN `ship_method` VARCHAR(32) DEFAULT ''EXPRESS'' AFTER `express_company`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
