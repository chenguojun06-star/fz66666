-- Hybrid Graph MAS v4.1: 新增 specialist / nodeTrace / digitalTwin / feedback 列
-- 幂等脚本：INFORMATION_SCHEMA 判断列是否存在

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_execution_log' AND COLUMN_NAME='specialist_results')=0,
    'ALTER TABLE `t_agent_execution_log` ADD COLUMN `specialist_results` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_execution_log' AND COLUMN_NAME='node_trace')=0,
    'ALTER TABLE `t_agent_execution_log` ADD COLUMN `node_trace` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_execution_log' AND COLUMN_NAME='digital_twin_snapshot')=0,
    'ALTER TABLE `t_agent_execution_log` ADD COLUMN `digital_twin_snapshot` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_execution_log' AND COLUMN_NAME='user_feedback')=0,
    'ALTER TABLE `t_agent_execution_log` ADD COLUMN `user_feedback` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_execution_log' AND COLUMN_NAME='feedback_note')=0,
    'ALTER TABLE `t_agent_execution_log` ADD COLUMN `feedback_note` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
