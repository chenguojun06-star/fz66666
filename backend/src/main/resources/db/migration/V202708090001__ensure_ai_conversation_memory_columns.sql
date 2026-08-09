-- ==================================================================
-- V202708090001: 兜底确保 t_ai_conversation_memory 的 4 个字段存在
--   user_message / ai_response / feedback_score / feedback_reason
--
-- 背景：
--   V202612030000 在建表后追加了这4个字段的 ALTER 语句，
--   但云端该迁移可能未完整执行（CREATE 成功但 ALTER 失败），
--   导致 MemoryArchiveService.archiveOldMemories() 调用
--   conversationMemoryMapper.selectList() 时 MyBatis 在
--   "setting parameters" 阶段失败（Unknown column）。
--
--   V202705031501 仅兜底了 feedback_reason，其余3个字段未兜底。
--   本迁移一次性兜底全部4个字段，彻底修复 L5 归档任务异常。
--
-- 安全规范（P0 铁律 #1）：
--   - 禁止 IF NOT EXISTS（MySQL 8.0 不支持）
--   - 用 information_schema + PREPARE/EXECUTE 实现幂等
--   - 禁止 SET @s 内包含 COMMENT 'xxx'（Flyway 静默失败）
--   - COMMENT 用独立 ALTER MODIFY 语句添加
--
-- 参考模板：V202707221000__add_temporal_fields_to_ai_long_memory.sql
-- ==================================================================

-- ── 1. 幂等添加 user_message 列 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_conversation_memory'
       AND COLUMN_NAME  = 'user_message') = 0,
    'ALTER TABLE `t_ai_conversation_memory` ADD COLUMN `user_message` TEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `t_ai_conversation_memory` MODIFY COLUMN `user_message` TEXT DEFAULT NULL COMMENT '用户原始消息';

-- ── 2. 幂等添加 ai_response 列 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_conversation_memory'
       AND COLUMN_NAME  = 'ai_response') = 0,
    'ALTER TABLE `t_ai_conversation_memory` ADD COLUMN `ai_response` TEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `t_ai_conversation_memory` MODIFY COLUMN `ai_response` TEXT DEFAULT NULL COMMENT 'AI原始回复';

-- ── 3. 幂等添加 feedback_score 列 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_conversation_memory'
       AND COLUMN_NAME  = 'feedback_score') = 0,
    'ALTER TABLE `t_ai_conversation_memory` ADD COLUMN `feedback_score` TINYINT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `t_ai_conversation_memory` MODIFY COLUMN `feedback_score` TINYINT DEFAULT NULL COMMENT '用户反馈评分(1-5)';

-- ── 4. 幂等添加 feedback_reason 列（V202705031501 已兜底，此处再兜底一次确保万无一失） ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_ai_conversation_memory'
       AND COLUMN_NAME  = 'feedback_reason') = 0,
    'ALTER TABLE `t_ai_conversation_memory` ADD COLUMN `feedback_reason` VARCHAR(500) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `t_ai_conversation_memory` MODIFY COLUMN `feedback_reason` VARCHAR(500) DEFAULT NULL COMMENT '反馈原因';

SELECT CONCAT('兜底完成: t_ai_conversation_memory 4个字段已确保存在 (user_message/ai_response/feedback_score/feedback_reason)') AS result;
