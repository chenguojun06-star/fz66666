-- F16: 为 t_intelligence_metrics 新增 prompt_tokens / completion_tokens 列
-- 用于记录每次 AI 调用的 token 级消耗，便于成本估算与异常检测

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='prompt_tokens')=0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `prompt_tokens` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_metrics' AND COLUMN_NAME='completion_tokens')=0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `completion_tokens` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
