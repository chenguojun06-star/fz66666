-- 为生产订单表添加首单/翻单字段
-- FIRST=首单，REORDER=翻单（默认FIRST）
-- 幂等写法：云端已手动执行过，INFORMATION_SCHEMA 判断避免重复添加报错
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_production_order'
       AND COLUMN_NAME = 'plate_type') = 0,
    'ALTER TABLE t_production_order ADD COLUMN plate_type VARCHAR(20) NOT NULL DEFAULT ''FIRST'' COMMENT ''订单类型:FIRST=首单,REORDER=翻单''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
