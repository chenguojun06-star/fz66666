-- V8: Add index for Scan SKU optimization
-- 优化扫码进度统计查询性能
CREATE INDEX IF NOT EXISTS idx_scan_stats
ON t_scan_record (order_no, scan_result, color, size);
