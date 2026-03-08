-- 工厂日产能字段
-- 供排产建议引擎读取（替代硬编码500件/天）
-- ⚠️ 改为幂等写法（INFORMATION_SCHEMA 判断），支持 FLYWAY_ENABLED=true 自动执行
SET @s_daily_cap = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'daily_capacity') = 0,
    'ALTER TABLE `t_factory` ADD COLUMN `daily_capacity` INT DEFAULT 500 COMMENT ''工厂日产能（件/天），用于AI排产建议''',
    'SELECT 1'
);
PREPARE stmt FROM @s_daily_cap; EXECUTE stmt; DEALLOCATE PREPARE stmt;
