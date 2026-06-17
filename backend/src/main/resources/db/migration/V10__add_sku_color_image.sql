-- V10: 添加SKU颜色图片字段
-- 用于存储款号+颜色级别的图片，支持按颜色展示SKU图片

DROP PROCEDURE IF EXISTS _add_columns;
DELIMITER //
CREATE PROCEDURE _add_columns()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_sku' AND COLUMN_NAME='sku_color_image') THEN
        ALTER TABLE t_product_sku ADD COLUMN sku_color_image VARCHAR(500) DEFAULT NULL COMMENT 'SKU颜色图片URL' AFTER color;
    END IF;
END //
DELIMITER ;
CALL _add_columns();
DROP PROCEDURE IF EXISTS _add_columns;

-- 添加备注字段用于图片描述
DROP PROCEDURE IF EXISTS _add_columns2;
DELIMITER //
CREATE PROCEDURE _add_columns2()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_sku' AND COLUMN_NAME='sku_color_remark') THEN
        ALTER TABLE t_product_sku ADD COLUMN sku_color_remark VARCHAR(200) DEFAULT NULL COMMENT 'SKU颜色图片备注' AFTER sku_color_image;
    END IF;
END //
DELIMITER ;
CALL _add_columns2();
DROP PROCEDURE IF EXISTS _add_columns2;
