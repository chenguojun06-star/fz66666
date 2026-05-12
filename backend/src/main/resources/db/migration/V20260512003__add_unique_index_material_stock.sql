SET @s = IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_stock'
       AND INDEX_NAME = 'uk_material_stock_tenant_code_color_size') = 0,
    'ALTER TABLE t_material_stock ADD UNIQUE INDEX uk_material_stock_tenant_code_color_size (tenant_id, material_code, color, size, delete_flag)',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
