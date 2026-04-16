CREATE INDEX IF NOT EXISTS idx_warehousing_order_bundle_delete
    ON t_product_warehousing(order_id, cutting_bundle_id, delete_flag);

CREATE INDEX IF NOT EXISTS idx_warehousing_bundle_qualified
    ON t_product_warehousing(cutting_bundle_id, quality_status, delete_flag);

CREATE INDEX IF NOT EXISTS idx_scan_record_order_bundle_result
    ON t_scan_record(order_id, cutting_bundle_id, scan_result);
