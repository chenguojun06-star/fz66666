SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_intelligence_metrics'
               AND COLUMN_NAME = 'trace_id') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `trace_id` VARCHAR(64) DEFAULT NULL COMMENT ''AI调用追踪ID'' AFTER `model`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_intelligence_metrics'
               AND COLUMN_NAME = 'trace_url') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `trace_url` VARCHAR(500) DEFAULT NULL COMMENT ''外部观测平台Trace链接'' AFTER `trace_id`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_intelligence_metrics'
               AND COLUMN_NAME = 'tool_call_count') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `tool_call_count` INT DEFAULT NULL COMMENT ''本次AI调用工具次数'' AFTER `response_chars`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
