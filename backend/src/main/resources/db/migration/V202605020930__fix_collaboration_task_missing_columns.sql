-- ============================================================
-- 补偿脚本：修复 t_collaboration_task 缺失列
-- ============================================================
-- 根本原因：V20260501001__enhance_collaboration_task.sql 使用了
--   ADD COLUMN IF NOT EXISTS 语法，该语法为 MariaDB / MySQL 8.0.31+ 特性，
--   云端 MySQL 版本不满足，语句被忽略（无报错），Flyway 记录为成功，
--   但列实际未创建。导致定时任务 findOverdueNotEscalated 每次查询 task_status
--   均报 "Unknown column 'task_status' in 'where clause'"，每30分钟产生日志风暴。
-- 修复方式：使用 INFORMATION_SCHEMA 幂等模式补充所有缺失列（禁止使用 COMMENT 在动态SQL中）
-- ============================================================

-- task_status（任务状态，findOverdueNotEscalated 查询必须字段）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='task_status')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `task_status` VARCHAR(32) DEFAULT ''PENDING''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- priority（优先级，findOverdueNotEscalated ORDER BY 依赖字段）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='priority')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `priority` VARCHAR(16) DEFAULT ''MEDIUM''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- assignee_name（执行人姓名）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='assignee_name')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `assignee_name` VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- acceptance_criteria（验收条件）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='acceptance_criteria')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `acceptance_criteria` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- escalated_at（升级时间，findOverdueNotEscalated WHERE 依赖字段）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='escalated_at')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `escalated_at` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- escalated_to（升级目标）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='escalated_to')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `escalated_to` VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- source_type（来源类型）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='source_type')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `source_type` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- source_instruction（原始AI指令原文）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='source_instruction')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `source_instruction` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completion_note（完成备注）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='completion_note')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `completion_note` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completed_at（实际完成时间）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='completed_at')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `completed_at` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 补充索引（使用 INFORMATION_SCHEMA.STATISTICS 幂等判断）
-- ============================================================

-- idx_collab_status
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_status')=0,
    'CREATE INDEX `idx_collab_status` ON `t_collaboration_task` (`task_status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_collab_priority_due
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_priority_due')=0,
    'CREATE INDEX `idx_collab_priority_due` ON `t_collaboration_task` (`priority`, `due_at`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_collab_assignee
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_assignee')=0,
    'CREATE INDEX `idx_collab_assignee` ON `t_collaboration_task` (`assignee_name`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- idx_collab_tenant_status
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_tenant_status')=0,
    'CREATE INDEX `idx_collab_tenant_status` ON `t_collaboration_task` (`tenant_id`, `task_status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ============================================================
-- 同步补偿 t_intelligence_audit_log（V20260501001 同批未执行的列）
-- ============================================================

-- self_consistency_agreement（自一致性验证一致率）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_audit_log' AND COLUMN_NAME='self_consistency_agreement')=0,
    'ALTER TABLE `t_intelligence_audit_log` ADD COLUMN `self_consistency_agreement` DECIMAL(5,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- guard_warnings（真实性守卫告警内容汇总）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_audit_log' AND COLUMN_NAME='guard_warnings')=0,
    'ALTER TABLE `t_intelligence_audit_log` ADD COLUMN `guard_warnings` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
