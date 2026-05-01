-- ============================================================
-- 三次补偿脚本：确保 t_collaboration_task 所有必要列均存在
-- ============================================================
-- 背景：V202605020930 的 SET @s + DEFAULT ''PENDING'' 被 Flyway 截断（铁律#11），
--   V202605021000 修复了 task_status/priority 但可能尚未部署到云端。
--   云端 DB 仍缺列 → findOverdueNotEscalated 每30分钟报 setting parameters 错误。
-- 策略：全部用 DEFAULT NULL（动态SQL内零字符串字面量），独立 UPDATE 回填默认值。
--   INFORMATION_SCHEMA 幂等判断，已存在的列跳过，可重复执行无副作用。
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='task_status')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `task_status` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `t_collaboration_task` SET `task_status` = 'PENDING' WHERE `task_status` IS NULL;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='priority')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `priority` VARCHAR(16) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

UPDATE `t_collaboration_task` SET `priority` = 'MEDIUM' WHERE `priority` IS NULL;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='escalated_at')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `escalated_at` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='escalated_to')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `escalated_to` VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='assignee_name')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `assignee_name` VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='acceptance_criteria')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `acceptance_criteria` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='source_type')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `source_type` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='source_instruction')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `source_instruction` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='completion_note')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `completion_note` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='completed_at')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `completed_at` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_status')=0,
    'CREATE INDEX `idx_collab_status` ON `t_collaboration_task` (`task_status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_priority_due')=0,
    'CREATE INDEX `idx_collab_priority_due` ON `t_collaboration_task` (`priority`, `due_at`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_tenant_status')=0,
    'CREATE INDEX `idx_collab_tenant_status` ON `t_collaboration_task` (`tenant_id`, `task_status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
