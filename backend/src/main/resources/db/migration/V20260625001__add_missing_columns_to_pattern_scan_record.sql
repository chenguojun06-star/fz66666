-- ============================================================
-- V20260625001: 为 t_pattern_scan_record 补全缺失的3个字段
-- 根因：dd96c9df2 提交中给 PatternScanRecord 实体新增了 size/quantity/styleName，
--       但没有对应的 Flyway 迁移，导致查询报 Unknown column 500 错误
-- 幂等写法：先通过 INFORMATION_SCHEMA.COLUMNS 检测列是否存在
-- ============================================================

-- 1. size 字段
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND COLUMN_NAME='size')=0,
    'ALTER TABLE `t_pattern_scan_record` ADD COLUMN `size` VARCHAR(32) DEFAULT NULL COMMENT ''码数''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. quantity 字段
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND COLUMN_NAME='quantity')=0,
    'ALTER TABLE `t_pattern_scan_record` ADD COLUMN `quantity` INT DEFAULT NULL COMMENT ''数量''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. style_name 字段
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND COLUMN_NAME='style_name')=0,
    'ALTER TABLE `t_pattern_scan_record` ADD COLUMN `style_name` VARCHAR(255) DEFAULT NULL COMMENT ''款号名称''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
