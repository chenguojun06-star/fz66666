-- 为生产订单表添加紧急程度字段
-- urgent=急单，normal=普通（默认）
-- 幂等写法：云端已手动执行过，INFORMATION_SCHEMA 判断避免重复添加报错
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_production_order'
       AND COLUMN_NAME = 'urgency_level') = 0,
    'ALTER TABLE t_production_order ADD COLUMN urgency_level VARCHAR(20) NOT NULL DEFAULT ''normal'' COMMENT ''紧急程度:urgent=急单,normal=普通''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
