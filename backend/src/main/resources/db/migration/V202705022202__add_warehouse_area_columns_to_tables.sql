SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_product_warehousing' AND COLUMN_NAME = 'warehouse_area_id') = 0,
    'ALTER TABLE t_product_warehousing ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL AFTER warehouse_area_name, ADD COLUMN warehouse_area_name VARCHAR(100) DEFAULT NULL AFTER warehouse_area_id',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_product_outstock' AND COLUMN_NAME = 'warehouse_area_id') = 0,
    'ALTER TABLE t_product_outstock ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL, ADD COLUMN warehouse_area_name VARCHAR(100) DEFAULT NULL AFTER warehouse_area_id',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_inbound' AND COLUMN_NAME = 'warehouse_area_id') = 0,
    'ALTER TABLE t_material_inbound ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL, ADD COLUMN warehouse_area_name VARCHAR(100) DEFAULT NULL AFTER warehouse_area_id',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_stock' AND COLUMN_NAME = 'warehouse_area_id') = 0,
    'ALTER TABLE t_material_stock ADD COLUMN warehouse_area_id VARCHAR(64) DEFAULT NULL, ADD COLUMN warehouse_area_name VARCHAR(100) DEFAULT NULL AFTER warehouse_area_id',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_warehouse_location' AND COLUMN_NAME = 'area_id') = 0,
    'ALTER TABLE t_warehouse_location ADD COLUMN area_id VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
