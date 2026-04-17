-- idx_warehousing_order_bundle_delete
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_warehousing_order_bundle_delete')=0,
    'CREATE INDEX idx_warehousing_order_bundle_delete ON t_product_warehousing(order_id, cutting_bundle_id, delete_flag)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_warehousing_bundle_qualified
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_warehousing_bundle_qualified')=0,
    'CREATE INDEX idx_warehousing_bundle_qualified ON t_product_warehousing(cutting_bundle_id, quality_status, delete_flag)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_scan_record_order_bundle_result
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_scan_record_order_bundle_result')=0,
    'CREATE INDEX idx_scan_record_order_bundle_result ON t_scan_record(order_id, cutting_bundle_id, scan_result)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
