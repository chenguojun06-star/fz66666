-- D-864：巡检动作表去重查询缺联合索引
--
-- 背景（生产 slow.log 实测，2026-10-24）：以下形态的查询跑 9.0 秒、扫 71.3 万行
--   SELECT COUNT(*) FROM t_ai_patrol_action
--   WHERE tenant_id = ? AND issue_type = ? AND target_id = ?
--     AND status = 'AUTO_EXECUTED' AND execution_time >= ?
-- 现有索引均为单列或两列组合，无法覆盖该谓词组合 → 每次都退化成大范围扫描。
--
-- 本迁移补联合索引，列序与查询谓词完全一致（等值列在前、范围列 execution_time 在后）。
--
-- 幂等：MySQL 8.0 不支持 CREATE INDEX IF NOT EXISTS，用 information_schema 探测后再建
-- （项目既有写法，见 V202709240004）。

SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_ai_patrol_action'
    AND INDEX_NAME = 'idx_patrol_tenant_issue_target_status'
);

SET @ddl := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_patrol_tenant_issue_target_status
     ON t_ai_patrol_action (tenant_id, issue_type, target_id, status, execution_time)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
