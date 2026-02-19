SET @check_sql = '';

SELECT GROUP_CONCAT(
  CONCAT(
    'SELECT ''', TABLE_NAME, '.', COLUMN_NAME, ''' AS location, COUNT(*) AS cnt ',
    'FROM `', TABLE_NAME, '` ',
    'WHERE `', COLUMN_NAME, '` IS NOT NULL ',
    'AND LENGTH(`', COLUMN_NAME, '`) > CHAR_LENGTH(`', COLUMN_NAME, '`) * 3'
  ) SEPARATOR ' UNION ALL '
) INTO @check_sql
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND DATA_TYPE IN ('varchar','text','longtext','mediumtext')
  AND TABLE_NAME LIKE 't_%'
  AND TABLE_NAME NOT LIKE 'v_%';

SET @check_sql = CONCAT('SELECT * FROM (', @check_sql, ') AS results WHERE cnt > 0 ORDER BY cnt DESC');

PREPARE stmt FROM @check_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
