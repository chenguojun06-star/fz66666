-- ============================================================
-- 兜底补齐 t_production_order 全部持久化字段
-- 修复 ProductionOrderMapper.insert-Inline "setting parameters" 失败
-- 原因：实体新增了字段但部分环境 Flyway 未跑全，insert 时列不存在
-- 策略：逐列 IF NOT EXISTS 补齐，幂等可重复执行
-- ============================================================

-- order_no
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_no')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_no` VARCHAR(64) DEFAULT NULL COMMENT ''订单号''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- qr_code
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='qr_code')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `qr_code` VARCHAR(255) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- color
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='color')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `color` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- size
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='size')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `size` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- sku
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='sku')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `sku` VARCHAR(128) DEFAULT NULL COMMENT ''SKU编号''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- sku_auto_generate
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='sku_auto_generate')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `sku_auto_generate` TINYINT(1) DEFAULT 0 COMMENT ''是否自动生成SKU''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- order_details
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_details')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_details` TEXT', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- progress_workflow_json
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_json')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_json` MEDIUMTEXT', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- progress_workflow_locked
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked` TINYINT DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- progress_workflow_locked_at
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked_at')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked_at` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- progress_workflow_locked_by
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked_by')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked_by` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- progress_workflow_locked_by_name
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked_by_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `progress_workflow_locked_by_name` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- transfer_log_json
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='transfer_log_json')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `transfer_log_json` TEXT', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- style_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='style_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `style_id` VARCHAR(64) DEFAULT NULL COMMENT ''款号ID''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- skc
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='skc')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `skc` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- style_no
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='style_no')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `style_no` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- style_name
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='style_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `style_name` VARCHAR(128) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- factory_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_id` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- factory_name
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_name` VARCHAR(128) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- org_unit_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='org_unit_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `org_unit_id` VARCHAR(64) DEFAULT NULL COMMENT ''生产组织节点ID快照''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- parent_org_unit_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='parent_org_unit_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `parent_org_unit_id` VARCHAR(64) DEFAULT NULL COMMENT ''归属部门节点ID快照''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- parent_org_unit_name
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='parent_org_unit_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `parent_org_unit_name` VARCHAR(128) DEFAULT NULL COMMENT ''归属部门名称快照''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- org_path
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='org_path')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `org_path` VARCHAR(1000) DEFAULT NULL COMMENT ''组织路径快照''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- factory_type
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_type` VARCHAR(32) DEFAULT NULL COMMENT ''内外工厂标签快照''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- factory_contact_person
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_contact_person')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_contact_person` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- factory_contact_phone
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_contact_phone')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_contact_phone` VARCHAR(32) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- merchandiser
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='merchandiser')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `merchandiser` VARCHAR(64) DEFAULT NULL COMMENT ''跟单员''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- company
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='company')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `company` VARCHAR(128) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- sales_channel
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='sales_channel')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `sales_channel` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- customer_contact
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_contact')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `customer_contact` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- customer_phone
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_phone')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `customer_phone` VARCHAR(32) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- customer_address
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_address')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `customer_address` VARCHAR(255) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- product_category
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='product_category')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `product_category` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- pattern_maker
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='pattern_maker')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `pattern_maker` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- order_quantity
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_quantity')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_quantity` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- completed_quantity
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='completed_quantity')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `completed_quantity` INT DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- material_arrival_rate
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='material_arrival_rate')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `material_arrival_rate` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- procurement_manually_completed
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_manually_completed')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_manually_completed` TINYINT DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- procurement_confirmed_by
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_by` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- procurement_confirmed_by_name
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_by_name` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- procurement_confirmed_at
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_at')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_at` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- procurement_confirm_remark
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirm_remark')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirm_remark` VARCHAR(255) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- production_progress
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='production_progress')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `production_progress` INT DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- status
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='status')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `status` VARCHAR(32) DEFAULT ''pending''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- urgency_level
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='urgency_level')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `urgency_level` VARCHAR(16) DEFAULT ''normal''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- urge_count
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='urge_count')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `urge_count` INT DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- last_urge_time
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='last_urge_time')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `last_urge_time` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- plate_type
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='plate_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `plate_type` VARCHAR(16) DEFAULT ''FIRST''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- is_quick_response
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='is_quick_response')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `is_quick_response` TINYINT(1) DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- standard_delivery_days
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='standard_delivery_days')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `standard_delivery_days` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- actual_delivery_days
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='actual_delivery_days')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `actual_delivery_days` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- delivery_sla_status
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='delivery_sla_status')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `delivery_sla_status` VARCHAR(32) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- planned_start_date
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='planned_start_date')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `planned_start_date` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- planned_end_date
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='planned_end_date')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `planned_end_date` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- actual_start_date
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='actual_start_date')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `actual_start_date` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- actual_end_date
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='actual_end_date')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `actual_end_date` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- delete_flag
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='delete_flag')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `delete_flag` TINYINT DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- factory_unit_price
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_unit_price')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_unit_price` DECIMAL(12,4) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- order_unit_price
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_unit_price')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_unit_price` DECIMAL(12,4) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- order_unit_price_type
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_unit_price_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_unit_price_type` VARCHAR(32) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- created_by_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='created_by_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `created_by_id` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- created_by_name
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='created_by_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `created_by_name` VARCHAR(64) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- remarks
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='remarks')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `remarks` VARCHAR(500) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- node_operations
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='node_operations')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `node_operations` TEXT', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- expected_ship_date
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='expected_ship_date')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `expected_ship_date` DATETIME DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- procurement_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- cutting_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='cutting_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `cutting_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- secondary_process_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='secondary_process_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `secondary_process_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- car_sewing_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='car_sewing_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `car_sewing_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- ironing_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='ironing_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `ironing_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- packaging_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='packaging_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `packaging_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- quality_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='quality_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `quality_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- warehousing_budget_hours
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='warehousing_budget_hours')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `warehousing_budget_hours` INT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- platform_code
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='platform_code')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `platform_code` VARCHAR(32) DEFAULT NULL COMMENT ''电商平台代码''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- order_biz_type
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_biz_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_biz_type` VARCHAR(16) DEFAULT NULL COMMENT ''下单业务类型''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- source_biz_type
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='source_biz_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `source_biz_type` VARCHAR(32) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- pushed_to_order
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='pushed_to_order')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `pushed_to_order` TINYINT DEFAULT 0', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- pricing_mode
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='pricing_mode')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `pricing_mode` VARCHAR(16) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- scatter_pricing_mode
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='scatter_pricing_mode')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `scatter_pricing_mode` VARCHAR(16) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- scatter_cutting_unit_price
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='scatter_cutting_unit_price')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `scatter_cutting_unit_price` DECIMAL(12,4) DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- version (乐观锁)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='version')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `version` INT DEFAULT 0 COMMENT ''乐观锁版本号''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- tenant_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- ext_json
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='ext_json')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `ext_json` TEXT', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- material_cost
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='material_cost')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `material_cost` DECIMAL(14,4) DEFAULT NULL COMMENT ''面辅料成本汇总''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- total_cost
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='total_cost')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `total_cost` DECIMAL(14,4) DEFAULT NULL COMMENT ''订单总成本''', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- customer_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `customer_id` VARCHAR(64) NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- customer_name
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `customer_name` VARCHAR(100) NULL', 'SELECT 1'); PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
