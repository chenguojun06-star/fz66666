-- V20260606001: t_style_info 新增 AI 难度评估持久化字段
-- AI 识别的款式难度结果保存到数据库，避免每次重新计算
-- MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用 INFORMATION_SCHEMA 幂等写法

SET @s1 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'difficulty_score') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `difficulty_score` INT DEFAULT NULL COMMENT ''AI难度评分1-10''',
    'SELECT 1'
);
PREPARE stmt1 FROM @s1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @s2 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'difficulty_level') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `difficulty_level` VARCHAR(20) DEFAULT NULL COMMENT ''AI难度级别: SIMPLE/MEDIUM/COMPLEX/HIGH_END''',
    'SELECT 1'
);
PREPARE stmt2 FROM @s2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @s3 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'difficulty_label') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `difficulty_label` VARCHAR(20) DEFAULT NULL COMMENT ''AI难度中文标签''',
    'SELECT 1'
);
PREPARE stmt3 FROM @s3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

SET @s4 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'pricing_multiplier') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `pricing_multiplier` DECIMAL(5,2) DEFAULT NULL COMMENT ''AI难度定价倍率''',
    'SELECT 1'
);
PREPARE stmt4 FROM @s4;
EXECUTE stmt4;
DEALLOCATE PREPARE stmt4;