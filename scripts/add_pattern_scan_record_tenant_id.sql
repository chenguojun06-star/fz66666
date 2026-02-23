-- 修复：t_pattern_scan_record 表缺少 tenant_id 列
-- 原因：PatternScanRecord 实体类添加了 tenantId 字段，但未同步执行 ALTER TABLE
-- 影响：
--   1. INSERT 报错 "Unknown column 'tenant_id' in 'field list'"（MyBatisPlusMetaObjectHandler 自动填充 tenantId）
--   2. SELECT 报错（TenantInterceptor 自动注入 WHERE tenant_id = ? 条件）
-- 日期：2026-02-24

ALTER TABLE t_pattern_scan_record
  ADD COLUMN tenant_id BIGINT NULL COMMENT '租户ID，多租户数据隔离' AFTER delete_flag,
  ADD INDEX idx_tenant_id (tenant_id);
