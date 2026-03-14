-- V20260422001: 补全 t_style_info.image_insight 列
-- 原 V20260419002 脚本因 COMMENT 关键字被换行断开导致列未实际创建
-- 本脚本使用单行 INFORMATION_SCHEMA 幂等写法修复

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'image_insight') = 0, 'ALTER TABLE `t_style_info` ADD COLUMN `image_insight` VARCHAR(500) NULL COMMENT ''AI视觉图像分析摘要''', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
