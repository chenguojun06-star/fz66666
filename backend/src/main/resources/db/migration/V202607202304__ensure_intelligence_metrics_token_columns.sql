-- Rescue: V202607202301 (add_token_columns_to_intelligence_metrics) may have
-- silently failed on cloud due to MySQL PREPARE/EXECUTE transient issue.
-- Re-applying identical idempotent logic under a new version number forces
-- Flyway to execute again, safely adding the columns if still missing.
-- If columns already exist (V202607202301 succeeded), SET @s = 'SELECT 1' is no-op.

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_intelligence_metrics'
      AND COLUMN_NAME  = 'prompt_tokens') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `prompt_tokens` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_intelligence_metrics'
      AND COLUMN_NAME  = 'completion_tokens') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `completion_tokens` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
