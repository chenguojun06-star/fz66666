-- 二次工艺图片URL列表（JSON数组，存储腾讯云COS URL），幂等添加
-- 用于生产订单列表直接展示/上传二次工艺过程照片
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'secondary_process_images') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `secondary_process_images` TEXT DEFAULT NULL COMMENT ''二次工艺图片URL列表(JSON数组)''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
