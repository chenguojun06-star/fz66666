-- V202606181002: 修复 t_color_card 表列名（fabric_width/fabric_weight/fabric_composition）
-- 修复 V20260617003 中错误的列名（width_cm/weight_gsm/composition）
-- 幂等写法：如果列已存在（正确列名）则跳过，如果存在旧列名则重命名
-- 注意：IF 的 else 分支必须返回有效 SQL 字符串 'SELECT 1'，不能返回整数

-- 1. 如果存在旧的 width_cm 列，重命名为 fabric_width
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_color_card' AND COLUMN_NAME = 'width_cm') = 1,
    'ALTER TABLE `t_color_card` CHANGE COLUMN `width_cm` `fabric_width` VARCHAR(50) COMMENT ''幅宽(cm)''' ,
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 如果存在旧的 weight_gsm 列，重命名为 fabric_weight
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_color_card' AND COLUMN_NAME = 'weight_gsm') = 1,
    'ALTER TABLE `t_color_card` CHANGE COLUMN `weight_gsm` `fabric_weight` VARCHAR(50) COMMENT ''克重(GSM)''' ,
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 如果存在旧的 composition 列，重命名为 fabric_composition
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_color_card' AND COLUMN_NAME = 'composition') = 1,
    'ALTER TABLE `t_color_card` CHANGE COLUMN `composition` `fabric_composition` VARCHAR(500) COMMENT ''成分含量''' ,
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
