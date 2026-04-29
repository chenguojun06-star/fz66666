DROP PROCEDURE IF EXISTS `__mig_V20260429001__add_payroll_item_bundle_fields`;
DELIMITER $$
CREATE PROCEDURE `__mig_V20260429001__add_payroll_item_bundle_fields`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

    ALTER TABLE t_payroll_settlement_item
        ADD COLUMN color VARCHAR(64) DEFAULT NULL,
        ADD COLUMN size VARCHAR(64) DEFAULT NULL,
        ADD COLUMN process_code VARCHAR(64) DEFAULT NULL,
        ADD COLUMN cutting_bundle_no INT DEFAULT NULL;

END$$
DELIMITER ;
CALL `__mig_V20260429001__add_payroll_item_bundle_fields`();
DROP PROCEDURE IF EXISTS `__mig_V20260429001__add_payroll_item_bundle_fields`;
