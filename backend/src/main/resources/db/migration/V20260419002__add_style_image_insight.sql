-- V20260419002: 在 t_style_info 表中新增 image_insight 字段
-- 用于持久化 AI 视觉分析摘要，避免每次打开款式页都重新调用 AI 接口
-- 使用 INFORMATION_SCHEMA 幂等写法（云端 Flyway 安全执行）

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'image_insight') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `image_insight` VARCHAR(500) NULL COMMENT ''AI视觉图像分析摘要（豆包Vision识别结果，用于持久化缓存）'' AFTER `cover`',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
