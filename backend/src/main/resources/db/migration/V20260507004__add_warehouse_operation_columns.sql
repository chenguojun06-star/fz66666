SET @s = IF(NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_product_warehousing' AND COLUMN_NAME = 'sku_code'
), 'ALTER TABLE t_product_warehousing ADD COLUMN sku_code VARCHAR(80) DEFAULT NULL AFTER scan_mode', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_product_outstock' AND COLUMN_NAME = 'source_type'
), 'ALTER TABLE t_product_outstock ADD COLUMN source_type VARCHAR(30) DEFAULT NULL AFTER outstock_type', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
