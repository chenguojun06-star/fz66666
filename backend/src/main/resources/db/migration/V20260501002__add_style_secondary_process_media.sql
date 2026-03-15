-- 为 t_secondary_process 添加图片和附件字段
-- 图片：JSON 数组，存储 COS 图片 URL
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_secondary_process' AND COLUMN_NAME='images')=0,
    'ALTER TABLE `t_secondary_process` ADD COLUMN `images` TEXT DEFAULT NULL COMMENT ''工艺图片URL列表(JSON数组)''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 附件：JSON 数组，每项格式 {"name":"xx.pdf","url":"https://..."}
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_secondary_process' AND COLUMN_NAME='attachments')=0,
    'ALTER TABLE `t_secondary_process` ADD COLUMN `attachments` TEXT DEFAULT NULL COMMENT ''工艺附件列表(JSON数组，格式[{name,url}])''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
