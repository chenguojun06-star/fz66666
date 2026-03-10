-- =============================================================================
-- 修复 personal-stats 接口超时导致的连接池耗尽问题
-- 问题根因：selectPersonalStats 查询用 YEAR()/MONTH()/DATE() 函数导致全表扫描，
--           同时 NOT IN(subquery) 产生嵌套循环，在扫码记录量大时耗时 10-60 秒。
--           多个工人同时加载扫码页 → 连接池耗尽 → 所有扫码 HTTP 400。
-- 修复方案：添加联合索引支持范围查询 + 业务查询覆盖索引
-- 幂等处理：云端已于 2026-02-26 手动执行，使用 INFORMATION_SCHEMA 判断避免重复建索引报错
-- =============================================================================

-- 1. personal-stats 核心索引：operator_id 精确匹配 + scan_time 范围查询
SET @s = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 't_scan_record'
       AND index_name = 'idx_scan_record_operator_stats') = 0,
    'CREATE INDEX idx_scan_record_operator_stats ON t_scan_record (operator_id, scan_time, scan_result, quantity)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. scan/execute 按菲号查前置校验的索引（validateProductionPrerequisite）
SET @s = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 't_scan_record'
       AND index_name = 'idx_scan_record_order_bundle_type') = 0,
    'CREATE INDEX idx_scan_record_order_bundle_type ON t_scan_record (order_id, cutting_bundle_id, scan_type, scan_result)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. personal-stats 的 NOT EXISTS 子查询使用的索引
SET @s = IF(
    (SELECT COUNT(*) FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 't_production_order'
       AND index_name = 'idx_production_order_status_flag') = 0,
    'CREATE INDEX idx_production_order_status_flag ON t_production_order (status, delete_flag)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
