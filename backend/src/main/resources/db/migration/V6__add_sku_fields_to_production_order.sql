-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V6__add_sku_fields_to_production_order`;
DELIMITER $$
CREATE PROCEDURE `__mig_V6__add_sku_fields_to_production_order`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- V6: 补全生产订单表SKU相关字段
    -- 创建时间: 2026-01-23
    -- 说明: 补全 t_production_order 表中缺失的 color, size, order_details 字段

    ALTER TABLE t_production_order
    ADD COLUMN color VARCHAR(100) COMMENT '颜色(多色以逗号分隔)',
    ADD COLUMN size VARCHAR(100) COMMENT '尺码(多码以逗号分隔)',
    ADD COLUMN order_details TEXT COMMENT '订单SKU明细(JSON格式)';

END$$
DELIMITER ;
CALL `__mig_V6__add_sku_fields_to_production_order`();
DROP PROCEDURE IF EXISTS `__mig_V6__add_sku_fields_to_production_order`;
