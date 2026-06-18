-- ==========================================================================
-- 修复 V202607192305 性能索引引用不存在的列
--
-- V202607192305 对 t_scan_record 创建 (scan_time, tenant_id) 索引，
-- 但 t_scan_record 中：
--   - scan_time 列不存在（实际列名是 create_time）
--   - tenant_id 列不存在
-- 直接执行会报 "Key column doesn't exist" 并再次 BLOCK 所有后续迁移。
--
-- 本迁移防御式检查每列存在性，缺失则降级：
--   - scan_time 不存在 → 使用 create_time
--   - tenant_id 不存在 → 跳过 tenant_id（单列索引）
--   - create_time 也不存在 → 跳过整个索引
-- ==========================================================================

SET @col_sr_st = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_time');
SET @col_sr_ct = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='create_time');
SET @col_sr_ti = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');

-- 策略：优先使用 scan_time（业务语义），降级到 create_time
SET @time_col = IF(@col_sr_st=1, 'scan_time', IF(@col_sr_ct=1, 'create_time', NULL));

-- t_scan_record 时间列索引（性能优化核心）
SET @idx_sql = IF(@time_col IS NOT NULL,
    IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_scan_time_tenant') > 0,
        'SELECT 1',
        IF(@col_sr_ti=1,
            CONCAT('CREATE INDEX idx_sr_scan_time_tenant ON t_scan_record(', @time_col, ', tenant_id)'),
            CONCAT('CREATE INDEX idx_sr_scan_time_tenant ON t_scan_record(', @time_col, ')'))),
    'SELECT 1');

PREPARE stmt FROM @idx_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
