-- ================================================================
-- 修复: t_sys_notice.content VARCHAR(512) → TEXT
-- 根因: V20260322b 创建表时 content 为 VARCHAR(512) NOT NULL,
--       V202705031800 的 CREATE TABLE IF NOT EXISTS 定义为 TEXT,
--       但表已存在时只 ADD COLUMN 不 ALTER COLUMN, 导致 content 保持 VARCHAR(512)
-- 错误: Data too long for column 'content' / error occurred while setting parameters
-- 触发: SmartNotifyJob/AI工具 发送通知时 content 超过 512 字符
-- ================================================================
SET @content_is_varchar = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_sys_notice'
      AND COLUMN_NAME = 'content'
      AND DATA_TYPE = 'varchar'
);
SET @s = IF(@content_is_varchar > 0,
    'ALTER TABLE `t_sys_notice` MODIFY COLUMN `content` TEXT',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
