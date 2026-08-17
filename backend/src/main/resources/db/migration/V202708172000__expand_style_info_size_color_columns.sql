-- =====================================================================
-- 样衣保存 400 根因修复：t_style_info.size 列 VARCHAR(20) 装不下多码数拼接串
--
-- 现象：样衣详情页保存数量 PUT /api/style/info 400 "保存失败"（100% 复现）
-- 根因：前端 buildSizeString 将所有选中码数 join('/') 拼接
--       （如 'XS(155/72A)/S(160/76)/M(165/80)/L(170/84)/XL(175/88)/D(定制码)' = 59 字符），
--       超过 t_style_info.size VARCHAR(20) 列宽，触发 DataIntegrityViolationException，
--       被 StyleInfoOrchestrator.update catch-all 吞掉后统一抛"保存失败"。
--       用户选中 2 个以上长码数（如 XS(155/72A)/S(160/76)）即必现。
-- 修复：size 扩到 VARCHAR(500)（容纳 10+ 个全码数拼接）；color 防御性扩到 VARCHAR(200)。
-- 幂等：MODIFY 前用 INFORMATION_SCHEMA 检查当前列宽是否已达标（CHARACTER_MAXIMUM_LENGTH）。
-- 注意：SET @s 内 COMMENT 使用双单引号转义（Flyway 静默失败陷阱）。
-- =====================================================================

-- 1. size VARCHAR(20) -> VARCHAR(500)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'size'
       AND CHARACTER_MAXIMUM_LENGTH >= 500) = 0,
    'ALTER TABLE `t_style_info` MODIFY COLUMN `size` VARCHAR(500) DEFAULT NULL COMMENT ''尺码（多码数斜杠拼接）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. color 防御性扩列（当前存单色值，与 size 同源的拼接风险）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'color'
       AND CHARACTER_MAXIMUM_LENGTH >= 200) = 0,
    'ALTER TABLE `t_style_info` MODIFY COLUMN `color` VARCHAR(200) DEFAULT NULL COMMENT ''颜色（首个颜色值）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
