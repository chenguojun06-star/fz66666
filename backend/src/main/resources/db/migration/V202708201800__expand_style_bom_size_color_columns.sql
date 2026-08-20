-- =====================================================================
-- BOM 保存 500 根因修复：t_style_bom.size/color 列 VARCHAR(20) 装不下多码数/多颜色拼接串
--
-- 现象：保存物料清单 POST /api/style/bom 500
--       "Data truncation: Data too long for column 'size' at row 1"
-- 根因：前端新建 BOM 行初始化 size = activeSizes.join('/')
--       （如 'XS(155/72A)/S(160/76)/M(165/80)/L(170/84)/XL(175/88)/D(定制码)' = 59 字符），
--       超过 t_style_bom.size VARCHAR(20) 列宽，触发 DataIntegrityViolationException；
--       color VARCHAR(20) 同源风险（多颜色拼接、长色名如"浅卡其/雾霾蓝(偏灰)"）。
-- 修复：与 V202708172000（t_style_info 同类问题）保持一致，
--       size 扩到 VARCHAR(500)，color 防御性扩到 VARCHAR(500)。
-- 幂等：MODIFY 前用 INFORMATION_SCHEMA 检查当前列宽是否已达标（CHARACTER_MAXIMUM_LENGTH）。
-- 注意：SET @s 内 COMMENT 使用双单引号转义（Flyway 静默失败陷阱）。
-- =====================================================================

-- 1. size VARCHAR(20) -> VARCHAR(500)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_bom'
       AND COLUMN_NAME = 'size'
       AND CHARACTER_MAXIMUM_LENGTH >= 500) = 0,
    'ALTER TABLE `t_style_bom` MODIFY COLUMN `size` VARCHAR(500) DEFAULT NULL COMMENT ''尺码/规格（多码数斜杠拼接）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. color VARCHAR(20) -> VARCHAR(500)（防御性扩列）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_bom'
       AND COLUMN_NAME = 'color'
       AND CHARACTER_MAXIMUM_LENGTH >= 500) = 0,
    'ALTER TABLE `t_style_bom` MODIFY COLUMN `color` VARCHAR(500) DEFAULT NULL COMMENT ''颜色（多颜色拼接）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
