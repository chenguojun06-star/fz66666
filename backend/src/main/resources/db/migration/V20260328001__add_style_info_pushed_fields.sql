-- Fix: StyleInfo Entity 新增字段补齐迁移
-- Entity 字段：pushedToOrder (Integer), pushedToOrderTime (LocalDateTime)
-- DB 列映射：pushed_to_order, pushed_to_order_time
-- 本迁移脚本为幂等操作，使用 INFORMATION_SCHEMA 检查列是否存在

-- 添加 pushed_to_order 列（INTEGER）
SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_style_info'
      AND COLUMN_NAME = 'pushed_to_order'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE t_style_info ADD COLUMN pushed_to_order INT DEFAULT 0 COMMENT "是否已推送到订单: 0-未推送, 1-已推送"',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 添加 pushed_to_order_time 列（DATETIME）
SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_style_info'
      AND COLUMN_NAME = 'pushed_to_order_time'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE t_style_info ADD COLUMN pushed_to_order_time DATETIME DEFAULT NULL COMMENT "推送到订单的时间"',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
