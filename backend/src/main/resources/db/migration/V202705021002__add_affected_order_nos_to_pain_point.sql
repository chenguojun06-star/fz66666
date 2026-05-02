SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_intelligence_pain_point' AND COLUMN_NAME='affected_order_nos');
SET @s = IF(@col_exists = 0, 'ALTER TABLE t_intelligence_pain_point ADD COLUMN affected_order_nos VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
