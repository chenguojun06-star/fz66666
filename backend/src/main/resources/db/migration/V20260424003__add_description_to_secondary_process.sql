SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_secondary_process'
     AND COLUMN_NAME = 'description') = 0,
  'ALTER TABLE t_secondary_process ADD COLUMN description VARCHAR(255) DEFAULT NULL AFTER process_name',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
