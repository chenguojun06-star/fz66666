-- V20260425001: 为 BOM 清单和尺寸表添加图片 URLs 字段
-- t_style_bom  新增 image_urls TEXT  (JSON 数组，自动从面辅料资料带出，也可手动上传)
-- t_style_size 新增 image_urls TEXT  (JSON 数组，每个部位行可上传多张参考图片)

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_bom'
       AND COLUMN_NAME  = 'image_urls') = 0,
    'ALTER TABLE `t_style_bom` ADD COLUMN `image_urls` TEXT DEFAULT NULL COMMENT ''物料图片URLs(JSON数组)''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_size'
       AND COLUMN_NAME  = 'image_urls') = 0,
    'ALTER TABLE `t_style_size` ADD COLUMN `image_urls` TEXT DEFAULT NULL COMMENT ''部位参考图片URLs(JSON数组)''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
