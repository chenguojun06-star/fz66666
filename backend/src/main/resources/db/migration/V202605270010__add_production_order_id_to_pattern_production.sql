SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_production' AND COLUMN_NAME='production_order_id')=0,
    'ALTER TABLE t_pattern_production ADD COLUMN production_order_id VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_production' AND INDEX_NAME='idx_pattern_production_order_id')=0,
    'CREATE INDEX idx_pattern_production_order_id ON t_pattern_production (production_order_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;