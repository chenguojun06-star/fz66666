-- ============================================================
-- 二次补偿脚本：修复 task_status 和 priority 列
-- ============================================================
-- 原因：V202605020930 脚本中 DEFAULT ''PENDING'' 和 DEFAULT ''MEDIUM''
--   包含字符串字面量，Flyway SQL 解析器把第一个 '' 当作字符串结束符，
--   导致 ALTER TABLE 语句被截断，这两列实际上没有被添加。
--   此为 copilot-instructions.md 中 SET @s=IF() 禁止使用 COMMENT ''text'' 的同类问题。
-- 修复：改用 DEFAULT NULL，完全避免动态SQL字符串中出现任何字符串字面量。
--   用单独的 UPDATE 语句回填现有行的默认值（UPDATE 不在动态SQL中，Flyway解析安全）。
-- ============================================================

-- task_status（findOverdueNotEscalated WHERE 查询必须字段）
-- 使用 DEFAULT NULL，避免 ''PENDING'' 在 SET @s 字符串内被 Flyway 截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='task_status')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `task_status` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填：现有行置为 PENDING（直接 SQL，不在动态字符串中，Flyway 解析安全）
UPDATE `t_collaboration_task` SET `task_status` = 'PENDING' WHERE `task_status` IS NULL;

-- priority（findOverdueNotEscalated ORDER BY 依赖字段）
-- 使用 DEFAULT NULL，避免 ''MEDIUM'' 在 SET @s 字符串内被 Flyway 截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='priority')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `priority` VARCHAR(16) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填：现有行置为 MEDIUM
UPDATE `t_collaboration_task` SET `priority` = 'MEDIUM' WHERE `priority` IS NULL;

-- 补充索引（仅当列已存在时才创建索引，通过 INFORMATION_SCHEMA.STATISTICS 幂等判断）
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
