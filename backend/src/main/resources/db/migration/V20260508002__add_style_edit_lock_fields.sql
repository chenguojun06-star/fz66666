-- 为款式表新增"生产制单编辑锁定"和"纸样修改编辑锁定"字段
-- description_locked: 1=锁定不可编辑（默认）, 0=已退回可编辑
-- pattern_rev_locked: 1=锁定不可编辑（默认）, 0=已退回可编辑
-- 退回人/时间/备注用于记录审批轨迹

-- description_locked
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'description_locked') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_locked` TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''生产制单锁定: 1=锁定, 0=已退回可编辑''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- description_return_comment
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'description_return_comment') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_return_comment` TEXT DEFAULT NULL COMMENT ''生产制单退回备注''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- description_return_by
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'description_return_by') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_return_by` VARCHAR(100) DEFAULT NULL COMMENT ''生产制单退回人''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- description_return_time
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'description_return_time') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `description_return_time` DATETIME DEFAULT NULL COMMENT ''生产制单退回时间''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- pattern_rev_locked
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'pattern_rev_locked') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_locked` TINYINT(1) NOT NULL DEFAULT 1 COMMENT ''纸样修改锁定: 1=锁定, 0=已退回可编辑''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- pattern_rev_return_comment
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'pattern_rev_return_comment') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_return_comment` TEXT DEFAULT NULL COMMENT ''纸样修改退回备注''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- pattern_rev_return_by
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'pattern_rev_return_by') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_return_by` VARCHAR(100) DEFAULT NULL COMMENT ''纸样修改退回人''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- pattern_rev_return_time
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'pattern_rev_return_time') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pattern_rev_return_time` DATETIME DEFAULT NULL COMMENT ''纸样修改退回时间''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
