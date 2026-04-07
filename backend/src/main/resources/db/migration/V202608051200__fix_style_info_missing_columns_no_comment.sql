-- ============================================================
-- 修复说明：
-- V20260429001、V20260508002、V20260508003 均在 SET @s = IF(...) 的
-- 动态 SQL 字符串中使用了 COMMENT ''text''，Flyway SQL 解析器把
-- 第一个 '' 当作字符串结束符，导致 ALTER TABLE 语句被截断，
-- PREPARE stmt FROM @s 执行的是不完整 SQL（Silent failure）。
-- 以下所有列在云端 t_style_info 中均未被实际添加。
-- 本脚本使用无 COMMENT 的安全写法逐一补齐，全部幂等。
-- ============================================================

-- ----------------------------------------------------------
-- 来自 V20260429001（fabric_composition_parts）
-- ----------------------------------------------------------
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'fabric_composition_parts') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `fabric_composition_parts` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------
-- 来自 V20260508002（生产制单锁定相关字段）
-- ----------------------------------------------------------
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'description_locked') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_locked` TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'description_return_comment') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_return_comment` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'description_return_by') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_return_by` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'description_return_time') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_return_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------
-- 来自 V20260508002（纸样修改锁定相关字段）
-- ----------------------------------------------------------
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'pattern_rev_locked') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_locked` TINYINT(1) NOT NULL DEFAULT 1',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'pattern_rev_return_comment') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_return_comment` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'pattern_rev_return_by') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_return_by` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'pattern_rev_return_time') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_return_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ----------------------------------------------------------
-- 来自 V20260508003（update_by）
-- ----------------------------------------------------------
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'update_by') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `update_by` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
