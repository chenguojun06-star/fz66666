-- =====================================================================
-- V20260428001: 款式档案新增五大洗涤护理图标代码字段
-- 背景：洗水唛标签需要展示 ISO 3758 标准护理符号（洗涤/漂白/烘干/熨烫/干洗），
--       目前只有文本字段，无结构化图标代码，无法自动渲染标准洗涤符号。
-- 影响表：t_style_info
-- 枚举值：
--   wash_temp_code : W30 / W40 / W60 / W95 / HAND / NO
--   bleach_code    : ANY / NON_CHL / NO
--   tumble_dry_code: NORMAL / LOW / NO
--   iron_code      : LOW / MED / HIGH / NO
--   dry_clean_code : YES / NO
-- =====================================================================

-- 新增 wash_temp_code（洗涤温度代码）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'wash_temp_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `wash_temp_code` VARCHAR(20) NULL COMMENT ''洗涤温度代码：W30/W40/W60/W95/HAND/NO''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 新增 bleach_code（漂白代码）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'bleach_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `bleach_code` VARCHAR(20) NULL COMMENT ''漂白代码：ANY/NON_CHL/NO''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 新增 tumble_dry_code（烘干代码）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'tumble_dry_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `tumble_dry_code` VARCHAR(20) NULL COMMENT ''烘干代码：NORMAL/LOW/NO''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 新增 iron_code（熨烫代码）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'iron_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `iron_code` VARCHAR(20) NULL COMMENT ''熨烫代码：LOW/MED/HIGH/NO''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 新增 dry_clean_code（干洗代码）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'dry_clean_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `dry_clean_code` VARCHAR(20) NULL COMMENT ''干洗代码：YES/NO''',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
