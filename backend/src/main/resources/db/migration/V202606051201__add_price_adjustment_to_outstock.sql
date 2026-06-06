-- V202606051201: 成品出库改价字段
-- MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用 INFORMATION_SCHEMA 幂等写法

SET @s1 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_product_outstock'
       AND COLUMN_NAME  = 'price_adjustment_reason') = 0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `price_adjustment_reason` VARCHAR(500) DEFAULT NULL COMMENT ''价格调整原因''',
    'SELECT 1'
);
PREPARE stmt1 FROM @s1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @s2 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_product_outstock'
       AND COLUMN_NAME  = 'original_sales_price') = 0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `original_sales_price` DECIMAL(12,2) DEFAULT NULL COMMENT ''原始销售价（调整前）''',
    'SELECT 1'
);
PREPARE stmt2 FROM @s2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;