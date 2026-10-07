-- D-767：清理 t_agent_checkpoint 遗留列（iteration / messages_json / tool_calls_json / total_tokens）
--
-- 【背景】V20260511001 建表时带 session_id / iteration / messages_json / tool_calls_json / total_tokens；
--   V20260513001 想一次性 DROP 掉这 5 列，但用「单列 session_id 的存在性」做守卫去控制整条多列 DROP：
--     SET @drop_sql = IF(@col_check2>0, 'ALTER TABLE ... DROP COLUMN session_id, DROP COLUMN iteration, ...', 'SELECT 1');
--   session_id 先被删掉后，守卫恒为假 → 整条被跳过 → 其余 4 列永久残留。
--   （该语句顺序本身也错：DROP COLUMN 排在 DROP FOREIGN KEY 之前，真跑会因外键报 1828。）
--
-- 【后果】iteration 是 INT NOT NULL 且无默认值，而实体 AgentCheckpoint 里它是 @TableField(exist=false)
--   （代码根本不写该列）→ 每次 Agent 图 checkpoint 插入都抛
--   DataIntegrityViolationException: Field 'iteration' doesn't have a default value
--   → 断点续跑完全失效 + 生产日志持续噪音（WARN，非致命）。
--
-- 【修法】逐列独立守卫（每列各自判断、各自 DROP），并先删外键、再删遗留索引。幂等，可重复执行。
--   不修改 V20260513001 —— flyway.validate-on-migrate=true，改动已应用脚本会因 checksum 不符阻断启动。
--
-- 【生产核对 2026-10-07】t_agent_checkpoint：0 行数据、无外键（入向+出向）、
--   无视图/触发器/存储过程引用、Java 代码零引用（实体字段全是 exist=false）→ 删除无任何数据风险。
--   遗留索引 idx_ac_session_iter 只含 iteration 一列（session_id 已被删）。

-- 1. 先删外键（若有；必须在 DROP COLUMN 之前，否则 MySQL 报 errno 1828）
SET @fk = (SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint'
             AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1);
SET @s = IF(@fk IS NULL, 'SELECT 1', CONCAT('ALTER TABLE t_agent_checkpoint DROP FOREIGN KEY `', @fk, '`'));
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 删遗留索引 idx_ac_session_iter（若有）
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
          WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND INDEX_NAME='idx_ac_session_iter');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP INDEX idx_ac_session_iter', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 逐列删除，每列各自独立守卫
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='session_id');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN session_id', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='iteration');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN iteration', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='messages_json');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN messages_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='tool_calls_json');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN tool_calls_json', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_checkpoint' AND COLUMN_NAME='total_tokens');
SET @s = IF(@c>0, 'ALTER TABLE t_agent_checkpoint DROP COLUMN total_tokens', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
