-- V202708291200: t_style_info 的 AI 洞察列 image_insight/vision_raw 由 VARCHAR(500) 扩为 TEXT
-- 根因：AI 视觉识别结果整段 JSON 经常超过 500 字符，触发 Data truncation，PUT /api/style/info 返回 400
-- 采用 INFORMATION_SCHEMA 幂等写法：列存在则 MODIFY，不存在则 ADD，兼容云端各种历史版本
-- SET @s 内部无换行、无反引号、无 COMMENT 子句，规避 Flyway 解析歧义

SET @has_image_insight = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'image_insight');
SET @sql_image_insight = IF(@has_image_insight = 0, 'ALTER TABLE t_style_info ADD COLUMN image_insight TEXT NULL', 'ALTER TABLE t_style_info MODIFY COLUMN image_insight TEXT NULL');
PREPARE stmt_image_insight FROM @sql_image_insight;
EXECUTE stmt_image_insight;
DEALLOCATE PREPARE stmt_image_insight;

SET @has_vision_raw = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'vision_raw');
SET @sql_vision_raw = IF(@has_vision_raw = 0, 'ALTER TABLE t_style_info ADD COLUMN vision_raw TEXT NULL', 'ALTER TABLE t_style_info MODIFY COLUMN vision_raw TEXT NULL');
PREPARE stmt_vision_raw FROM @sql_vision_raw;
EXECUTE stmt_vision_raw;
DEALLOCATE PREPARE stmt_vision_raw;