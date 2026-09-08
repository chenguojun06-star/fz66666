-- ============================================================
-- 协作任务创建人追踪 — 新增创建人字段
-- 功能：
--   1. 个人创建的任务可追踪（谁创建的、是否已被领取、进展到哪）
--   2. creator_name 存登录名（username），creator_id 存用户ID
--   3. 存量数据无法追溯创建人（此前未落库），保持 NULL 兼容
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='creator_id')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `creator_id` BIGINT',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='creator_name')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `creator_name` VARCHAR(64)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 创建人索引：按"我创建的"筛选时避免全表扫
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_creator')=0,
    'CREATE INDEX `idx_collab_creator` ON `t_collaboration_task` (`tenant_id`, `creator_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
