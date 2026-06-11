-- ============================================================
-- V20260608001: 样衣审核图片字段
-- 幂等：使用 INFORMATION_SCHEMA 守卫确保重复执行不报错
-- 安全：动态 SQL 内不含 COMMENT ''字符串'' 字面量（V202705300003 验证的陷阱）
-- ============================================================

-- 1. t_style_info 添加 sample_review_images
SET @s = (SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE t_style_info ADD COLUMN sample_review_images TEXT NULL',
    'SELECT 1'
) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_style_info'
     AND COLUMN_NAME = 'sample_review_images');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. t_pattern_production 添加 review_images
SET @s = (SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE t_pattern_production ADD COLUMN review_images TEXT NULL',
    'SELECT 1'
) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_pattern_production'
     AND COLUMN_NAME = 'review_images');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
