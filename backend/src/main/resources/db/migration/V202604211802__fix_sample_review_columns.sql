-- 修复云端 t_style_info 缺少 sample_review_* 字段
-- 根因：原 V10__add_sample_review_fields.sql 使用 DELIMITER $$ 语法（仅 MySQL CLI 支持），
-- Flyway 通过 JDBC 执行时无法解析，存储过程创建失败，CONTINUE HANDLER 静默吞掉异常，
-- Flyway 仍记录 V10 为 "success"，但 4 个 ALTER TABLE 列实际从未添加到云端 DB。
-- 本脚本通过 INFORMATION_SCHEMA 幂等写法补齐这 4 个缺失列。

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'sample_review_status') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `sample_review_status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'sample_review_comment') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `sample_review_comment` TEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'sample_reviewer') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `sample_reviewer` VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'sample_review_time') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `sample_review_time` DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
