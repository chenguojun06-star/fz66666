-- =====================================================================
-- V202710140002：补 AI 巡检相关索引 + 修 OR 谓词导致的慢查询（P1）
--
-- 背景（2026-10-14 生产库慢日志 + EXPLAIN 实测）：近一天慢查询 163 条，其中：
--
--   ① `t_ai_patrol_action` 60 条，来自 AiPatrolJob.executeAutoActions（每 10 分钟一次）：
--        SELECT ... FROM t_ai_patrol_action WHERE status='PENDING' AND risk_level='AUTO_EXECUTE'
--      该表 16241 行，索引只有 (tenant_id,status) / (issue_type,issue_severity) / action_uid，
--      **没有 (status, risk_level) 组合** → 全表扫描。
--
--   ② `t_ai_job_run_log` 16 条，来自 AiJobRunLogMapper.selectRecentByStatus：
--        SELECT * FROM t_ai_job_run_log
--        WHERE (#{status} IS NULL OR status = #{status})
--        ORDER BY start_time DESC LIMIT n
--      `(#{status} IS NULL OR status=#{status})` 这种 OR 谓词让优化器无法使用索引
--      （status 传 null 时整个条件恒真）→ 250 万行全表扫 + filesort。
--      单纯加索引解决不了，**代码侧已拆成两条语句**（无 status 时走已有的
--      selectRecent，有 status 时走按 status 过滤的新索引）。
--
-- 本迁移只做索引部分；代码侧改动见 AiJobRunLogMapper。
-- 全部用「存在才建」的幂等写法，失败不影响 Flyway 记录（生产库已有部分索引）。
-- =====================================================================

-- ① 巡检工单：(status, risk_level) 复合索引 —— 服务 executeAutoActions 的精确匹配
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action'
               AND INDEX_NAME = 'idx_ai_patrol_status_risk') = 0,
    'CREATE INDEX idx_ai_patrol_status_risk ON t_ai_patrol_action (status, risk_level)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ①b 同一个定时任务还按 COALESCE(close_time, execution_time, update_time) 清理工单，
--    补一个覆盖 close_time 的索引，避免清理时全表扫（生成列无法直接索引时间函数，
--    这里给清理涉及的三个状态列建索引，靠它把扫描范围收窄）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_patrol_action'
               AND INDEX_NAME = 'idx_ai_patrol_closetime') = 0,
    'CREATE INDEX idx_ai_patrol_closetime ON t_ai_patrol_action (close_time, status)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 任务执行日志：status + start_time 复合索引，服务按状态筛选的倒序分页
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_ai_job_run_log'
               AND INDEX_NAME = 'idx_ajrl_status_time') = 0,
    'CREATE INDEX idx_ajrl_status_time ON t_ai_job_run_log (status, start_time)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ②b 审计日志清理按 (tenant_id, created_at) 删，补一个同序复合索引
--    （原 idx 只在 tenant_id 上，排序/范围都要回表）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_audit_log'
               AND INDEX_NAME = 'idx_ial_tenant_created') = 0,
    'CREATE INDEX idx_ial_tenant_created ON t_intelligence_audit_log (tenant_id, created_at)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
