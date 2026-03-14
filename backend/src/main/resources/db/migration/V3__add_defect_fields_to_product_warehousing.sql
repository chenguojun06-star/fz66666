-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V3__add_defect_fields_to_product_warehousing`;
DELIMITER $$
CREATE PROCEDURE `__mig_V3__add_defect_fields_to_product_warehousing`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    ALTER TABLE t_product_warehousing
      ADD COLUMN defect_category VARCHAR(64) NULL COMMENT '次品类别' AFTER unqualified_image_urls,
      ADD COLUMN defect_remark VARCHAR(500) NULL COMMENT '次品备注' AFTER defect_category;

END$$
DELIMITER ;
CALL `__mig_V3__add_defect_fields_to_product_warehousing`();
DROP PROCEDURE IF EXISTS `__mig_V3__add_defect_fields_to_product_warehousing`;
