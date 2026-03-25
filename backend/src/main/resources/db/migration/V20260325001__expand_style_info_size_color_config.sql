-- 将 t_style_info.size_color_config 扩展为 MEDIUMTEXT
-- 原先老库可能是 VARCHAR，保存颜色/码数矩阵后容易触发 Data too long

SET @ddl = IF(
  (SELECT COUNT(*)
     FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_style_info'
      AND COLUMN_NAME = 'size_color_config') = 0,
  'ALTER TABLE `t_style_info` ADD COLUMN `size_color_config` MEDIUMTEXT DEFAULT NULL COMMENT ''颜色尺码数量矩阵JSON''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @alter_ddl = IF(
  (SELECT DATA_TYPE
     FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 't_style_info'
      AND COLUMN_NAME = 'size_color_config'
    LIMIT 1) <> 'mediumtext',
  'ALTER TABLE `t_style_info` MODIFY COLUMN `size_color_config` MEDIUMTEXT DEFAULT NULL COMMENT ''颜色尺码数量矩阵JSON''',
  'SELECT 1'
);
PREPARE stmt2 FROM @alter_ddl;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
