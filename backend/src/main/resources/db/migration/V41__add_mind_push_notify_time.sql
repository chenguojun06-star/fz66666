-- V41: 为 t_mind_push_rule 添加推送时段字段，支持用户自定义推送时间窗口
-- 幂等写法（INFORMATION_SCHEMA 判断）

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_mind_push_rule' AND COLUMN_NAME='notify_time_start')=0,
    'ALTER TABLE `t_mind_push_rule` ADD COLUMN `notify_time_start` VARCHAR(5) DEFAULT ''08:00'' COMMENT ''推送开始时间 HH:mm''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_mind_push_rule' AND COLUMN_NAME='notify_time_end')=0,
    'ALTER TABLE `t_mind_push_rule` ADD COLUMN `notify_time_end` VARCHAR(5) DEFAULT ''22:00'' COMMENT ''推送结束时间 HH:mm''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
