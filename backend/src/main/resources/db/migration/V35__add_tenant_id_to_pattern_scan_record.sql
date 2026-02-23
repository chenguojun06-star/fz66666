-- V35: 修复 t_pattern_scan_record 缺少 tenant_id 列
-- 原因：PatternScanRecord 实体类有 tenantId 字段（@TableField(fill=INSERT)），
--       MyBatisPlusMetaObjectHandler 在 INSERT 时自动填充，但表结构缺少该列，导致
--       INSERT/SELECT 均报 "Unknown column 'tenant_id' in 'field list'"

ALTER TABLE t_pattern_scan_record
    ADD COLUMN IF NOT EXISTS tenant_id BIGINT NULL COMMENT '租户ID，多租户数据隔离' AFTER delete_flag;

-- 避免重复创建索引
SET @exist := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE table_schema = DATABASE()
      AND table_name = 't_pattern_scan_record'
      AND index_name = 'idx_psr_tenant_id'
);
SET @sql = IF(@exist = 0,
    'ALTER TABLE t_pattern_scan_record ADD INDEX idx_psr_tenant_id (tenant_id)',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
