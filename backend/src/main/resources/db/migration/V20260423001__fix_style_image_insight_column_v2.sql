-- V20260423001: 再次修复 t_style_info.image_insight 列未创建问题
-- V20260422001 脚本的 SET @s 语句内部有换行且 COMMENT 含转义引号，
-- 导致 Flyway SQL 解析器截断 @s 变量内容，ALTER TABLE 静默失败
-- 本脚本：SET @s 单行、无 COMMENT 子句、无反引号，彻底规避解析歧义
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'image_insight');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE t_style_info ADD COLUMN image_insight VARCHAR(500) NULL', 'SELECT 1');
PREPARE fix_stmt FROM @sql;
EXECUTE fix_stmt;
DEALLOCATE PREPARE fix_stmt;
