-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V8__add_index_scan_stats`;
DELIMITER $$
CREATE PROCEDURE `__mig_V8__add_index_scan_stats`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- V8: Add index for Scan SKU optimization
    -- 优化扫码进度统计查询性能
    CREATE INDEX idx_scan_stats
    ON t_scan_record (order_no, scan_result, color, size);

END$$
DELIMITER ;
CALL `__mig_V8__add_index_scan_stats`();
DROP PROCEDURE IF EXISTS `__mig_V8__add_index_scan_stats`;
