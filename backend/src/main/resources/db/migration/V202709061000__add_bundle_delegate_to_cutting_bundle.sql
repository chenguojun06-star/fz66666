-- V202709061000: t_cutting_bundle 新增菲号委派字段 assignee_id/assignee_name/factory_name
-- 用途：PC端工序委派支持菲号批量勾选委派（人员委派绑定 assignee，工厂委派冗余 factory_name 展示）
-- 采用 INFORMATION_SCHEMA 幂等写法：列不存在则 ADD，已存在则跳过
-- SET @s 内部无换行、无反引号、无 COMMENT 子句，规避 Flyway 解析歧义

SET @has_assignee_id = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND COLUMN_NAME = 'assignee_id');
SET @sql_assignee_id = IF(@has_assignee_id = 0, 'ALTER TABLE t_cutting_bundle ADD COLUMN assignee_id VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt_assignee_id FROM @sql_assignee_id;
EXECUTE stmt_assignee_id;
DEALLOCATE PREPARE stmt_assignee_id;

SET @has_assignee_name = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND COLUMN_NAME = 'assignee_name');
SET @sql_assignee_name = IF(@has_assignee_name = 0, 'ALTER TABLE t_cutting_bundle ADD COLUMN assignee_name VARCHAR(64) NULL', 'SELECT 1');
PREPARE stmt_assignee_name FROM @sql_assignee_name;
EXECUTE stmt_assignee_name;
DEALLOCATE PREPARE stmt_assignee_name;

SET @has_factory_name = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND COLUMN_NAME = 'factory_name');
SET @sql_factory_name = IF(@has_factory_name = 0, 'ALTER TABLE t_cutting_bundle ADD COLUMN factory_name VARCHAR(128) NULL', 'SELECT 1');
PREPARE stmt_factory_name FROM @sql_factory_name;
EXECUTE stmt_factory_name;
DEALLOCATE PREPARE stmt_factory_name;
