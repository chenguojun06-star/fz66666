SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_inventory_check_item' AND COLUMN_NAME = 'style_no') = 0,
  'ALTER TABLE t_inventory_check_item ADD COLUMN style_no VARCHAR(64) AFTER sku_code',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_inventory_check_item' AND COLUMN_NAME = 'image_url') = 0,
  'ALTER TABLE t_inventory_check_item ADD COLUMN image_url VARCHAR(512) AFTER style_no',
  'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
