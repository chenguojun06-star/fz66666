-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V9__add_stock_quantity_to_product_sku`;
DELIMITER $$
CREATE PROCEDURE `__mig_V9__add_stock_quantity_to_product_sku`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    ALTER TABLE t_product_sku ADD COLUMN stock_quantity INT DEFAULT 0 COMMENT '库存数量';
    CREATE INDEX idx_sku_code ON t_product_sku (sku_code);

END$$
DELIMITER ;
CALL `__mig_V9__add_stock_quantity_to_product_sku`();
DROP PROCEDURE IF EXISTS `__mig_V9__add_stock_quantity_to_product_sku`;
