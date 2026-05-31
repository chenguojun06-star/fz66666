SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_style_info'
    AND COLUMN_NAME = 'use_sku_prefix'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE t_style_info ADD COLUMN use_sku_prefix INT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;