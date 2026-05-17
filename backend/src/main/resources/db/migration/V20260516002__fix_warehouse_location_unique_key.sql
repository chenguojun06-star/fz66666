SET @s = IF(EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_warehouse_location' AND INDEX_NAME = 'uk_location_code_tenant'
), 'ALTER TABLE t_warehouse_location DROP INDEX uk_location_code_tenant, ADD UNIQUE KEY uk_location_code_type_tenant (location_code, warehouse_type, tenant_id)', 'SELECT 1');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
