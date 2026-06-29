-- 修改 t_style_info.customer_id 列类型从 BIGINT 改为 VARCHAR(64)
-- 保持与其他表（t_production_order、t_receivable 等）的 customer_id 类型一致

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 't_style_info'
              AND COLUMN_NAME = 'customer_id'
              AND DATA_TYPE = 'bigint');

SET @s = IF(@col > 0,
    'ALTER TABLE t_style_info MODIFY COLUMN customer_id VARCHAR(64) DEFAULT NULL COMMENT ''客户ID，关联客户资料表''',
    'SELECT 1');

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
