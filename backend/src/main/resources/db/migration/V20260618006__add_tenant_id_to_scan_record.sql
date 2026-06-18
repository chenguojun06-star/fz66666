-- ==========================================================================
-- 为 t_scan_record 补充缺失的 tenant_id 列
--
-- 问题链：
-- 1. ScanRecord Entity 有 tenantId 字段（@TableField(fill=INSERT)）
-- 2. 但 init.sql 创建 t_scan_record 时未定义 tenant_id 列
-- 3. 导致 FactoryBottleneckOrchestrator / StyleIntelligenceProfileOrchestrator
--    / SystemDataMiner 等智能分析模块的 .eq(ScanRecord::getTenantId, ...) 查询
--    在运行时失败（Unknown column 'tenant_id'）
--
-- 现状：
-- - 核心扫码流程可能没走这些智能分析接口，所以没暴露
-- - 但 V202607192305 索引迁移会引用 tenant_id，提前补列可避免未来炸表
--
-- 策略：
-- - 添加 tenant_id 列，DEFAULT 0（老数据归属"未知租户"）
-- - INSERT 时由 MyBatis-Plus @TableField(fill=INSERT) 自动填充当前租户 ID
-- - 幂等：先检查列是否已存在
-- ==========================================================================

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE t_scan_record ADD COLUMN tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT ''租户ID'' AFTER status',
    'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
