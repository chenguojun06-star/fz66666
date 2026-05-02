-- 幂等保障：确保 t_cutting_bundle_split_log.split_status 列存在
-- V202705022200 使用直接 ALTER TABLE（可能在列已存在时失败），
-- 本脚本作为双保险，使用 INFORMATION_SCHEMA 条件判断，安全幂等。
-- 注意：动态 SQL 字符串内不能含字符串字面量（Flyway 解析问题），故使用 DEFAULT NULL，再由下方 UPDATE 回填
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_cutting_bundle_split_log'
       AND COLUMN_NAME = 'split_status') = 0,
    'ALTER TABLE `t_cutting_bundle_split_log` ADD COLUMN `split_status` VARCHAR(20) NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填历史记录：有 completed_bundle_id 的已完成，否则为待确认
UPDATE `t_cutting_bundle_split_log`
SET `split_status` = 'CONFIRMED'
WHERE `split_status` IS NULL AND `completed_bundle_id` IS NOT NULL;

UPDATE `t_cutting_bundle_split_log`
SET `split_status` = 'PENDING'
WHERE `split_status` IS NULL AND `completed_bundle_id` IS NULL;
