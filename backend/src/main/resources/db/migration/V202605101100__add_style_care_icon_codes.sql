SET @s = IF(
  NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info' AND COLUMN_NAME = 'care_icon_codes'),
  'ALTER TABLE t_style_info ADD COLUMN care_icon_codes TEXT',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
