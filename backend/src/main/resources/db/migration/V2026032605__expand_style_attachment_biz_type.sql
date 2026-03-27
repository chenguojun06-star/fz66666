SET @sql := IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_style_attachment'
     AND COLUMN_NAME = 'biz_type') = 0,
  'ALTER TABLE `t_style_attachment` ADD COLUMN `biz_type` VARCHAR(128) DEFAULT ''general'' COMMENT ''业务类型：general/pattern/sample/color_image::*''',
  'ALTER TABLE `t_style_attachment` MODIFY COLUMN `biz_type` VARCHAR(128) DEFAULT ''general'' COMMENT ''业务类型：general/pattern/sample/color_image::*'''
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
