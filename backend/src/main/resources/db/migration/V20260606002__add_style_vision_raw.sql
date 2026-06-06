-- V20260606002: 在 t_style_info 表中新增 vision_raw 字段
-- 用于持久化 Agnes 视觉模型的原始识别描述，避免每次重新调用 AI
-- 使用 INFORMATION_SCHEMA 幂等写法（云端 Flyway 安全执行）

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'vision_raw') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `vision_raw` VARCHAR(500) NULL AFTER `image_insight`',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
