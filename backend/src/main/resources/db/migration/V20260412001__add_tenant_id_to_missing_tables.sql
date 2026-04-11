-- ============================================================
-- V20260412001: 为缺失 tenant_id 的表补列 + 修改 t_material_pickup_record 的 tenant_id 类型
-- 幂等写法：先通过 INFORMATION_SCHEMA.COLUMNS 检测列是否存在
-- ============================================================

-- 1. t_process_parent_mapping
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_process_parent_mapping' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_process_parent_mapping` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_process_parent_mapping' AND INDEX_NAME='idx_t_process_parent_mapping_tenant_id')=0,
    'CREATE INDEX `idx_t_process_parent_mapping_tenant_id` ON `t_process_parent_mapping` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. t_cutting_bundle_split_log
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle_split_log' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_cutting_bundle_split_log` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_bundle_split_log' AND INDEX_NAME='idx_t_cutting_bundle_split_log_tenant_id')=0,
    'CREATE INDEX `idx_t_cutting_bundle_split_log_tenant_id` ON `t_cutting_bundle_split_log` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. t_pattern_revision
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_revision' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_pattern_revision` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_revision' AND INDEX_NAME='idx_t_pattern_revision_tenant_id')=0,
    'CREATE INDEX `idx_t_pattern_revision_tenant_id` ON `t_pattern_revision` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. t_pattern_scan_record
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_pattern_scan_record` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_scan_record' AND INDEX_NAME='idx_t_pattern_scan_record_tenant_id')=0,
    'CREATE INDEX `idx_t_pattern_scan_record_tenant_id` ON `t_pattern_scan_record` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. t_process_price_adjustment
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_process_price_adjustment' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_process_price_adjustment` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_process_price_adjustment' AND INDEX_NAME='idx_t_process_price_adjustment_tenant_id')=0,
    'CREATE INDEX `idx_t_process_price_adjustment_tenant_id` ON `t_process_price_adjustment` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. order_transfer
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_transfer' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `order_transfer` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='order_transfer' AND INDEX_NAME='idx_order_transfer_tenant_id')=0,
    'CREATE INDEX `idx_order_transfer_tenant_id` ON `order_transfer` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. t_purchase_order_doc
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_purchase_order_doc' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_purchase_order_doc` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_purchase_order_doc' AND INDEX_NAME='idx_t_purchase_order_doc_tenant_id')=0,
    'CREATE INDEX `idx_t_purchase_order_doc_tenant_id` ON `t_purchase_order_doc` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. t_factory_shipment_detail
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_factory_shipment_detail` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_shipment_detail' AND INDEX_NAME='idx_t_factory_shipment_detail_tenant_id')=0,
    'CREATE INDEX `idx_t_factory_shipment_detail_tenant_id` ON `t_factory_shipment_detail` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9. t_material_picking_item
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_material_picking_item` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND INDEX_NAME='idx_t_material_picking_item_tenant_id')=0,
    'CREATE INDEX `idx_t_material_picking_item_tenant_id` ON `t_material_picking_item` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 10. t_product_outstock
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_product_outstock` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_outstock' AND INDEX_NAME='idx_t_product_outstock_tenant_id')=0,
    'CREATE INDEX `idx_t_product_outstock_tenant_id` ON `t_product_outstock` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 11. t_production_exception_report
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_exception_report' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_production_exception_report` ADD COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_exception_report' AND INDEX_NAME='idx_t_production_exception_report_tenant_id')=0,
    'CREATE INDEX `idx_t_production_exception_report_tenant_id` ON `t_production_exception_report` (`tenant_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 12. t_material_pickup_record: 修改 tenant_id 列类型从 VARCHAR(64) 改为 BIGINT
SET @s = IF((SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='tenant_id')='varchar',
    'ALTER TABLE `t_material_pickup_record` MODIFY COLUMN `tenant_id` BIGINT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
