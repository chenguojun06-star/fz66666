-- D-541：补齐日志保留期参数，让"保留期可配"真正生效
--
-- 背景（2026-09-24 排查）：
--   1. AuditLogCleanupJob 早已按"保留天数可配"设计，但读参数的 SQL 写的是
--      `SELECT config_value FROM t_param_config WHERE config_key = ? AND delete_flag = 0`，
--      而这张表的真实列名是 `param_value` / `param_key`，且**根本没有 delete_flag 列** →
--      每次执行都抛 "Unknown column" 被 catch 成 debug 日志静默吞掉，**永远回落默认 90 天**。
--   2. 即使 SQL 正确，`system.auditLog.retentionDays` 这个键在库里也**不存在**
--      （实测 t_param_config 只有 system.name / system.version / upload.path 三行）。
--   → 结论："保留期可配"是双重失效，实际一直写死 90 天。
--
-- 本迁移：补齐日志保留期参数，配合代码侧修正列名后即可真正可配。
--   · system.auditLog.retentionDays —— 智能审计日志（t_intelligence_audit_log）
--   · system.jobRunLog.retentionDays —— AI 定时任务执行日志普通流水（t_ai_job_run_log）
--   · system.jobRunLog.failedRetentionDays —— 同上，但**仅失败记录**的保留天数
--
-- 为什么失败记录要单独多留（2026-09-24 实测依据）：
--   该表 221.9 万行里 99.98% 是 SUCCESS 流水，**FAILED 只有 340 条**；
--   而按 90 天口径统计，这 340 条**全部落在待删区间内** → 若一刀切，
--   清理后表里将一条失败记录都不剩，而失败记录正是这张表唯一的排障价值。
--   340 条体量极小，多留一年几乎不占空间，却能保住"这个任务历史上失败过几次"的线索。
--
-- 幂等：param_key 上有 UNIQUE KEY，用 ON DUPLICATE KEY UPDATE 做空操作，
--       **不会覆盖运维已手工调过的值**（重跑安全）。

INSERT INTO `t_param_config` (`param_key`, `param_value`, `param_desc`, `create_time`, `update_time`)
VALUES ('system.auditLog.retentionDays', '90', '智能审计日志保留天数（AuditLogCleanupJob，超期分批删除）', NOW(), NOW())
ON DUPLICATE KEY UPDATE `id` = `id`;

INSERT INTO `t_param_config` (`param_key`, `param_value`, `param_desc`, `create_time`, `update_time`)
VALUES ('system.jobRunLog.retentionDays', '90', 'AI定时任务执行日志保留天数（仅成功/跳过流水，超期分批删除）', NOW(), NOW())
ON DUPLICATE KEY UPDATE `id` = `id`;

INSERT INTO `t_param_config` (`param_key`, `param_value`, `param_desc`, `create_time`, `update_time`)
VALUES ('system.jobRunLog.failedRetentionDays', '365', 'AI定时任务执行日志中【失败记录】的保留天数（排障价值高，比普通流水多留）', NOW(), NOW())
ON DUPLICATE KEY UPDATE `id` = `id`;
