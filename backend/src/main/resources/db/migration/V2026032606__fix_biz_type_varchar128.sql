-- 修复 V2026032605 中 COMMENT 单引号转义导致 MODIFY 静默失败的问题
-- V2026032605 使用的 COMMENT ''...'' 被 Flyway SQL 解析器误截断，
-- 导致 biz_type 列仍为 VARCHAR(30) 而非 VARCHAR(128)。
-- 本脚本不带 COMMENT，纯幂等扩容。
SET @cur_len := (
    SELECT CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_style_attachment'
      AND COLUMN_NAME  = 'biz_type'
);
SET @fix_sql := IF(
    @cur_len IS NULL OR @cur_len < 128,
    'ALTER TABLE `t_style_attachment` MODIFY COLUMN `biz_type` VARCHAR(128) DEFAULT ''general''',
    'SELECT 1'
);
PREPARE fix_stmt FROM @fix_sql;
EXECUTE fix_stmt;
DEALLOCATE PREPARE fix_stmt;
