-- 为 t_style_bom 添加码数用量配比字段
-- 格式：{"S":1.5,"M":1.6,"L":1.7}，为空时统一使用 usage_amount
SET @col_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_style_bom'
      AND COLUMN_NAME  = 'size_usage_map'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE `t_style_bom` ADD COLUMN `size_usage_map` TEXT DEFAULT NULL COMMENT \'码数用量配比JSON，格式:{\"S\":1.5,\"M\":1.6}，空则统一使用usage_amount\' AFTER `usage_amount`',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
