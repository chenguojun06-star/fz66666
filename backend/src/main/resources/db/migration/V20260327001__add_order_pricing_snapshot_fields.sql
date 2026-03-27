-- 下单价格快照字段
-- 目的：下单时锁定订单单价与散剪单价，后续按订单快照执行

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'factory_unit_price') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_unit_price` DECIMAL(10,2) DEFAULT NULL COMMENT ''下单锁定单价（元/件）''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'pricing_mode') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `pricing_mode` VARCHAR(20) DEFAULT NULL COMMENT ''下单单价模式：PROCESS/SIZE/MANUAL''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'scatter_pricing_mode') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `scatter_pricing_mode` VARCHAR(20) DEFAULT NULL COMMENT ''散剪单价模式：FOLLOW_ORDER/MANUAL''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'scatter_cutting_unit_price') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `scatter_cutting_unit_price` DECIMAL(10,2) DEFAULT NULL COMMENT ''散剪单价快照（元/件）''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
