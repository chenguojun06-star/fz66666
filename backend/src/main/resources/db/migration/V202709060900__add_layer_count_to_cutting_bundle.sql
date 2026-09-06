-- V202709060900: t_cutting_bundle 新增面料层数 layer_count
-- 用途：手工编菲/一键生成菲号时按下单颜色与尺码录入面料层数，随菲号存储、列表展示并打印
-- 采用 INFORMATION_SCHEMA 幂等写法：列不存在则 ADD，已存在则跳过，兼容云端各种历史版本
-- SET @s 内部无换行、无反引号、无 COMMENT 子句，规避 Flyway 解析歧义

SET @has_layer_count = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND COLUMN_NAME = 'layer_count');
SET @sql_layer_count = IF(@has_layer_count = 0, 'ALTER TABLE t_cutting_bundle ADD COLUMN layer_count INT NULL', 'SELECT 1');
PREPARE stmt_layer_count FROM @sql_layer_count;
EXECUTE stmt_layer_count;
DEALLOCATE PREPARE stmt_layer_count;
