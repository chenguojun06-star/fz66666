-- 工序难度字段：t_style_process 新增 difficulty 列（易/中/难）
SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_process' AND COLUMN_NAME = 'difficulty') = 0,
  'ALTER TABLE `t_style_process` ADD COLUMN `difficulty` VARCHAR(10) DEFAULT NULL COMMENT ''工序难度（易/中/难）'' AFTER `machine_type`',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
