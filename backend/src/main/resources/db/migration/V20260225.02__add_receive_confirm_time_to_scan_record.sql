-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V20260225b__add_receive_confirm_time_to_scan_record`;
DELIMITER $$
CREATE PROCEDURE `__mig_V20260225b__add_receive_confirm_time_to_scan_record`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- 新增 receive_time 和 confirm_time 字段到 t_scan_record
    ALTER TABLE t_scan_record
      ADD COLUMN receive_time DATETIME NULL COMMENT '领取/开始时间',
      ADD COLUMN confirm_time DATETIME NULL COMMENT '录入结果/完成时间';

END$$
DELIMITER ;
CALL `__mig_V20260225b__add_receive_confirm_time_to_scan_record`();
DROP PROCEDURE IF EXISTS `__mig_V20260225b__add_receive_confirm_time_to_scan_record`;
