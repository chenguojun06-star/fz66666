-- =====================================================================
-- V20260427002: 款式档案新增洗水唛/标签字段
-- 背景：系统缺少面料成分、洗涤说明、U编码三个核心字段，
--       导致无法生成合规的洗水唛标签和吊牌。
-- 影响表：t_style_info
-- =====================================================================

-- 新增 fabric_composition（面料成分）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'fabric_composition') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `fabric_composition` VARCHAR(500) NULL COMMENT ''面料成分，如：70%棉 30%涤纶''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 新增 wash_instructions（洗涤说明）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'wash_instructions') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `wash_instructions` VARCHAR(500) NULL COMMENT ''洗涤说明，如：30°C水洗，不可漂白''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 新增 u_code（U编码/品质追溯码）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'u_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `u_code` VARCHAR(100) NULL COMMENT ''U编码/品质追溯码，用于吊牌打印''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
