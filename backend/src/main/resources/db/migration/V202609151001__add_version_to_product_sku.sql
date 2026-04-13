DROP PROCEDURE IF EXISTS add_version_to_product_sku;
DELIMITER $$
CREATE PROCEDURE add_version_to_product_sku()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_product_sku' AND COLUMN_NAME = 'version') THEN
        ALTER TABLE t_product_sku ADD COLUMN version INT DEFAULT 0 COMMENT '乐观锁版本号';
    END IF;
END$$
DELIMITER ;
CALL add_version_to_product_sku();
DROP PROCEDURE IF EXISTS add_version_to_product_sku;
