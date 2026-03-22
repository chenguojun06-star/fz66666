-- Fix: findActiveTenantIds() 每小时3次对 t_scan_record 全表扫描，耗时3000ms+
-- 原SQL: SELECT DISTINCT tenant_id FROM t_scan_record WHERE scan_time >= DATE_SUB(NOW(), INTERVAL 90 DAY)
-- 索引 (scan_time, tenant_id) 使该查询变为索引范围扫描，预期降至 <50ms

SET @idx = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_scan_record'
      AND INDEX_NAME   = 'idx_scan_time_tenant_lookup'
);
SET @sql = IF(@idx = 0,
    'CREATE INDEX idx_scan_time_tenant_lookup ON t_scan_record (scan_time, tenant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
