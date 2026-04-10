-- 交期预测日志表补列修复（历史库兼容）
-- 目标：确保 t_intelligence_prediction_log 至少具备扩展分析字段和 delete_flag

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_intelligence_prediction_log'
    AND COLUMN_NAME = 'factory_name') = 0,
  'ALTER TABLE `t_intelligence_prediction_log` ADD COLUMN `factory_name` VARCHAR(128) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_intelligence_prediction_log'
    AND COLUMN_NAME = 'daily_velocity') = 0,
  'ALTER TABLE `t_intelligence_prediction_log` ADD COLUMN `daily_velocity` DOUBLE DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_intelligence_prediction_log'
    AND COLUMN_NAME = 'remaining_qty') = 0,
  'ALTER TABLE `t_intelligence_prediction_log` ADD COLUMN `remaining_qty` BIGINT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_intelligence_prediction_log'
    AND COLUMN_NAME = 'delete_flag') = 0,
  'ALTER TABLE `t_intelligence_prediction_log` ADD COLUMN `delete_flag` INT NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史数据兜底
UPDATE t_intelligence_prediction_log SET delete_flag = 0 WHERE delete_flag IS NULL;
