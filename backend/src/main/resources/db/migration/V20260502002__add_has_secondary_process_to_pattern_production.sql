-- 样板生产表新增"是否有二次工艺"标志列
-- 默认 1 = 有二次工艺，0 = 无二次工艺
-- 使用 INFORMATION_SCHEMA 幂等写法（FLYWAY_ENABLED=true，脚本必须幂等）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_pattern_production'
       AND COLUMN_NAME  = 'has_secondary_process') = 0,
    'ALTER TABLE `t_pattern_production` ADD COLUMN `has_secondary_process` TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''是否有二次工艺 1=是 0=否''',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
