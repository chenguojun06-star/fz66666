-- 安全补偿：确保 t_secondary_process 包含 images 和 attachments 列
-- V20260501002 可能因 PREPARE/EXECUTE 中 COMMENT 单引号转义问题在部分环境下未正确执行
-- 本脚本去掉 COMMENT 文本，避免转义问题，确保幂等执行

SET @s1 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_secondary_process'
       AND COLUMN_NAME  = 'images') = 0,
    'ALTER TABLE `t_secondary_process` ADD COLUMN `images` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @s2 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_secondary_process'
       AND COLUMN_NAME  = 'attachments') = 0,
    'ALTER TABLE `t_secondary_process` ADD COLUMN `attachments` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;
