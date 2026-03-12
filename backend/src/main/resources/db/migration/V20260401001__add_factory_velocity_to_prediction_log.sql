-- 交期预测自我校准：补充工厂名、速度快照、剩余件数列
-- 幂等写法（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS）

SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_intelligence_prediction_log'
     AND COLUMN_NAME  = 'factory_name') = 0,
  'ALTER TABLE `t_intelligence_prediction_log` ADD COLUMN `factory_name` VARCHAR(128) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_intelligence_prediction_log'
     AND COLUMN_NAME  = 'daily_velocity') = 0,
  'ALTER TABLE `t_intelligence_prediction_log` ADD COLUMN `daily_velocity` DOUBLE NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_intelligence_prediction_log'
     AND COLUMN_NAME  = 'remaining_qty') = 0,
  'ALTER TABLE `t_intelligence_prediction_log` ADD COLUMN `remaining_qty` BIGINT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
