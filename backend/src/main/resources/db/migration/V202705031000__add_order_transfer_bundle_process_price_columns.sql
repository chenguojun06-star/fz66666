SET @s = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_transfer' AND COLUMN_NAME = 'bundle_ids'),
    'ALTER TABLE order_transfer ADD COLUMN bundle_ids VARCHAR(1000) NULL',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_transfer' AND COLUMN_NAME = 'process_codes'),
    'ALTER TABLE order_transfer ADD COLUMN process_codes VARCHAR(1000) NULL',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_transfer' AND COLUMN_NAME = 'process_price_overrides'),
    'ALTER TABLE order_transfer ADD COLUMN process_price_overrides TEXT NULL',
    'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
