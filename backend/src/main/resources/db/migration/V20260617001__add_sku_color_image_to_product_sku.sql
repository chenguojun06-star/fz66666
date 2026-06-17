-- 为SKU添加款号+颜色级别的图片字段
-- 用于SKU列表显示时在SKU编码前显示对应颜色的图片

DROP PROCEDURE IF EXISTS _add_sku_color_image_fields;
DELIMITER //
CREATE PROCEDURE _add_sku_color_image_fields()
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_sku' AND COLUMN_NAME='sku_color_image') THEN
        ALTER TABLE t_product_sku ADD COLUMN sku_color_image VARCHAR(500) DEFAULT NULL COMMENT 'SKU颜色图片URL（款号+颜色级别）' AFTER color;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_sku' AND COLUMN_NAME='sku_color_remark') THEN
        ALTER TABLE t_product_sku ADD COLUMN sku_color_remark VARCHAR(200) DEFAULT NULL COMMENT 'SKU颜色图片备注' AFTER sku_color_image;
    END IF;
END //
DELIMITER ;
CALL _add_sku_color_image_fields();
DROP PROCEDURE IF EXISTS _add_sku_color_image_fields;
