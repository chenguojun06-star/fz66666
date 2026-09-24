-- D-541：补回 t_ai_job_run_log 的 start_time 单列索引
--
-- 背景（2026-09-24 排查"给这张表加保留期清理"时发现）：
--   V202706260006__cleanup_redundant_indexes_v2.sql 把 `idx_start_time` 删掉了，
--   理由是「idx_start_time 与 idx_job_start 部分重叠」。**这个判断对只按时间过滤的查询是错的**：
--   当时的 idx_job_start / 现在的 idx_ajrl_job_time 都是 `(job_name, start_time)` 复合索引，
--   **以 job_name 打头**。按最左前缀原则，`WHERE start_time < X` 这种"只用第二列"的条件
--   **无法做 range 扫描** —— MySQL 只能退化成全索引扫描（实测 EXPLAIN：
--   `type=index, rows=2180211`，即 218 万条全过一遍）。
--
--   后果：任何"按时间范围"的查询/清理都是 O(全表)。本次要加的保留期清理正是这种语句，
--   按当时的状态跑会「越删越慢」——每批 500 条都要扫一遍全索引，183 万条要跑 3660 批。
--
--   对比实测（加索引前）：
--     WHERE start_time < X                      → type=index, rows=2180211（全扫）
--     WHERE job_name='EcSyncJob' AND start_time<X → type=range, rows=281428（正常）
--
-- 本迁移：补回单列索引。MySQL 8.0 加二级索引走 ONLINE DDL（INPLACE + LOCK=NONE），
--         不阻塞读写，2.18M 行预计数十秒。
--
-- 幂等：先查 information_schema.STATISTICS 再决定是否 ADD INDEX（与 V202608151001 同一写法）。

SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_ai_job_run_log'
    AND INDEX_NAME = 'idx_start_time'
);
SET @sql = IF(@idx_exists = 0,
  'ALTER TABLE `t_ai_job_run_log` ADD INDEX `idx_start_time` (`start_time`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
