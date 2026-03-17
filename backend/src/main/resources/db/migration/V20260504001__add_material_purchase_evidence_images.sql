-- 回料确认凭证图片字段：允许保存多张凭据图片URL（逗号分隔）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'evidence_image_urls') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `evidence_image_urls` TEXT DEFAULT NULL COMMENT ''回料确认凭证图片URLs（逗号分隔）''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
