-- V49__add_tag_price_to_product_sku.sql
-- 为 t_product_sku 表添加吊牌价字段，实现基础信息与 SKU 的价格三角联动
-- 关联字段：StyleInfo.tagPrice ↔ ProductSku.tagPrice（吊牌价）
-- 幂等性：用 information_schema 检查列是否存在，避免 Duplicate column 报错

DROP PROCEDURE IF EXISTS add_tag_price_to_product_sku;
DELIMITER //
CREATE PROCEDURE add_tag_price_to_product_sku()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 't_product_sku'
          AND COLUMN_NAME = 'tag_price'
    ) THEN
        ALTER TABLE t_product_sku
        ADD COLUMN tag_price DECIMAL(10,2) NULL COMMENT '吊牌价' AFTER cost_price;
    END IF;
END //
DELIMITER ;
CALL add_tag_price_to_product_sku();
DROP PROCEDURE IF EXISTS add_tag_price_to_product_sku;
