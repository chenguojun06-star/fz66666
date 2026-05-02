SET @s = NULL;

SET @s = (SELECT IF(COUNT(*) = 0,
    CONCAT('ALTER TABLE t_scan_record ADD INDEX idx_sr_tenant_order (tenant_id, order_id)'),
    'SELECT 1')
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 't_scan_record' AND index_name = 'idx_sr_tenant_order');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0,
    CONCAT('ALTER TABLE t_product_warehousing ADD INDEX idx_pw_tenant_order_delete (tenant_id, order_id, delete_flag)'),
    'SELECT 1')
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 't_product_warehousing' AND index_name = 'idx_pw_tenant_order_delete');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0,
    CONCAT('ALTER TABLE t_production_process_tracking ADD INDEX idx_ppt_tenant_order (tenant_id, production_order_id)'),
    'SELECT 1')
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 't_production_process_tracking' AND index_name = 'idx_ppt_tenant_order');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0,
    CONCAT('ALTER TABLE t_production_process_tracking ADD INDEX idx_ppt_tenant_bundle (tenant_id, cutting_bundle_id)'),
    'SELECT 1')
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 't_production_process_tracking' AND index_name = 'idx_ppt_tenant_bundle');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0,
    CONCAT('ALTER TABLE t_material_purchase ADD INDEX idx_mpu_tenant_order (tenant_id, order_id)'),
    'SELECT 1')
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 't_material_purchase' AND index_name = 'idx_mpu_tenant_order');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @s = (SELECT IF(COUNT(*) = 0,
    CONCAT('ALTER TABLE t_scan_record ADD INDEX idx_sr_tenant_scantime (tenant_id, scan_time)'),
    'SELECT 1')
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 't_scan_record' AND index_name = 'idx_sr_tenant_scantime');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
