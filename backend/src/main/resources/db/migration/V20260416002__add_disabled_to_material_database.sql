SET @dbname = DATABASE();
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_database' AND COLUMN_NAME='disabled');
SET @s = IF(@col=0, 'ALTER TABLE t_material_database ADD COLUMN disabled INT DEFAULT 0 COMMENT ''停用标识：0-正常，1-已停用''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
