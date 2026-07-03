-- ================================================================
-- V20260704002: 确保 t_sys_notice.action_payload 列存在且类型为 TEXT
--
-- 背景：
--   V20270628006 直接执行 MODIFY COLUMN action_payload，但该列可能不存在
--   导致 Flyway 迁移失败：Unknown column 'action_payload' in 't_sys_notice'
--   根因：V20270628006 是 out-of-order 乱序执行，跑在了 V202706280001 之前
--
-- 修复：
--   1. 如果 action_payload 列不存在，先 ADD COLUMN
--   2. 如果列存在但类型不是 TEXT，MODIFY COLUMN
--   这样 V20270628006 执行时列已存在，MODIFY 能成功
--
-- 幂等性：用 INFORMATION_SCHEMA + PREPARE stmt 模式，重复执行不报错
-- ================================================================

SET @dbname = DATABASE();

-- 1. 如果 action_payload 列不存在，先 ADD COLUMN
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='action_payload');
SET @s = IF(@c=0, 'ALTER TABLE t_sys_notice ADD COLUMN action_payload TEXT NULL COMMENT ''一键处理参数JSON''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 如果列存在但类型不是 TEXT，MODIFY COLUMN（确保类型正确）
SET @t = (SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='action_payload');
SET @s2 = IF(@t IS NOT NULL AND @t != 'text', 'ALTER TABLE t_sys_notice MODIFY COLUMN action_payload TEXT NULL COMMENT ''一键处理参数JSON''', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
