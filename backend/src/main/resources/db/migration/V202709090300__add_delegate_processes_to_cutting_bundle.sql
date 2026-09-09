-- V202709090300: t_cutting_bundle 新增 delegate_processes 字段
-- 用途：菲号委派支持「按工序精细隔离」——只把勾选的子工序外发，未勾选的工序仍由内部扫
-- 约定：逗号分隔的工序名（如 '剪线,整烫'）；为空 = 整扎外发（兼容历史数据）
-- 采用 INFORMATION_SCHEMA 幂等写法：列不存在则 ADD，已存在则跳过
-- SET @s 内部无换行、无反引号、无 COMMENT 子句、无 DEFAULT 字符串字面量，规避 Flyway 解析歧义

SET @has_delegate_processes = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_cutting_bundle' AND COLUMN_NAME = 'delegate_processes');
SET @sql_delegate_processes = IF(@has_delegate_processes = 0, 'ALTER TABLE t_cutting_bundle ADD COLUMN delegate_processes VARCHAR(500) NULL', 'SELECT 1');
PREPARE stmt_delegate_processes FROM @sql_delegate_processes;
EXECUTE stmt_delegate_processes;
DEALLOCATE PREPARE stmt_delegate_processes;
