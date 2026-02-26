-- =============================================================================
-- 修复 personal-stats 接口超时导致的连接池耗尽问题
-- 问题根因：selectPersonalStats 查询用 YEAR()/MONTH()/DATE() 函数导致全表扫描，
--           同时 NOT IN(subquery) 产生嵌套循环，在扫码记录量大时耗时 10-60 秒。
--           多个工人同时加载扫码页 → 连接池耗尽 → 所有扫码 HTTP 400。
-- 修复方案：添加联合索引支持范围查询 + 业务查询覆盖索引
-- =============================================================================

-- MySQL 不支持 CREATE INDEX IF NOT EXISTS，用 DROP IF EXISTS + CREATE 方式
-- Flyway 只会执行一次，DROP IF EXISTS 保证手动已建时不报错

-- 1. personal-stats 核心索引：operator_id 精确匹配 + scan_time 范围查询
--    配合 ScanRecordMapper.selectPersonalStats 的新 SQL（已用范围替代函数）
DROP INDEX IF EXISTS idx_scan_record_operator_stats ON t_scan_record;
CREATE INDEX idx_scan_record_operator_stats
    ON t_scan_record (operator_id, scan_time, scan_result, quantity);

-- 2. scan/execute 按菲号查前置校验的索引（validateProductionPrerequisite）
DROP INDEX IF EXISTS idx_scan_record_order_bundle_type ON t_scan_record;
CREATE INDEX idx_scan_record_order_bundle_type
    ON t_scan_record (order_id, cutting_bundle_id, scan_type, scan_result);

-- 3. personal-stats 的 NOT EXISTS 子查询使用的索引
DROP INDEX IF EXISTS idx_production_order_status_flag ON t_production_order;
CREATE INDEX idx_production_order_status_flag
    ON t_production_order (status, delete_flag);
