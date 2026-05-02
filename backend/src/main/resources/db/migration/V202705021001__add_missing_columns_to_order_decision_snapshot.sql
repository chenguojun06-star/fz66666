SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_decision_snapshot' AND COLUMN_NAME = 'decision_type');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_order_decision_snapshot ADD COLUMN decision_type VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_decision_snapshot' AND COLUMN_NAME = 'decision_data');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_order_decision_snapshot ADD COLUMN decision_data JSON', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_decision_snapshot' AND COLUMN_NAME = 'ai_suggestion');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_order_decision_snapshot ADD COLUMN ai_suggestion TEXT', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_decision_snapshot' AND COLUMN_NAME = 'ai_confidence');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_order_decision_snapshot ADD COLUMN ai_confidence DECIMAL(5,2)', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_decision_snapshot' AND COLUMN_NAME = 'user_choice');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_order_decision_snapshot ADD COLUMN user_choice VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_order_decision_snapshot' AND COLUMN_NAME = 'user_modified_fields');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_order_decision_snapshot ADD COLUMN user_modified_fields JSON', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
