-- ============================================================
-- 全量补偿迁移脚本：确保所有实体字段在数据库中都存在
-- 根因：Flyway COMMENT '' 语法bug导致20+个迁移脚本静默失败
-- 策略：对每个可能缺失的列使用 IF NOT EXISTS 幂等添加
-- ============================================================

-- ==================== t_material_purchase ====================
SET @dbname = DATABASE();

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='conversion_rate');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN conversion_rate DECIMAL(12,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='evidence_image_urls');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN evidence_image_urls TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_composition');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN fabric_composition VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_width');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN fabric_width VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_weight');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN fabric_weight VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='invoice_urls');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN invoice_urls TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_status');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN audit_status VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_reason');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN audit_reason VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_time');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN audit_time DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_operator_id');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN audit_operator_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_operator_name');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN audit_operator_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='supplier_contact_person');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN supplier_contact_person VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='supplier_contact_phone');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN supplier_contact_phone VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='color');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN color VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='size');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN size VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='expected_ship_date');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN expected_ship_date DATE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='source_type');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN source_type VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='pattern_production_id');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN pattern_production_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='inbound_record_id');
SET @s = IF(@col=0, 'ALTER TABLE t_material_purchase ADD COLUMN inbound_record_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_production_order ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_json');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN progress_workflow_json LONGTEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked_at');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_at DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked_by');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='progress_workflow_locked_by_name');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN progress_workflow_locked_by_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='transfer_log_json');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN transfer_log_json TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_manually_completed');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN procurement_manually_completed INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN procurement_confirmed_by VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by_name');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN procurement_confirmed_by_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_at');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN procurement_confirmed_at DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirm_remark');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN procurement_confirm_remark VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_unit_price');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN factory_unit_price DECIMAL(12,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='node_operations');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN node_operations TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='expected_ship_date');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN expected_ship_date DATE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_biz_type');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN order_biz_type VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='source_biz_type');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN source_biz_type VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='pushed_to_order');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN pushed_to_order INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='pricing_mode');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN pricing_mode VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='scatter_pricing_mode');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN scatter_pricing_mode VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='scatter_cutting_unit_price');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN scatter_cutting_unit_price DECIMAL(12,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='version');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN version INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='skc');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN skc VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='urgency_level');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN urgency_level VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='plate_type');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN plate_type VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_id');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN customer_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='merchandiser');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN merchandiser VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='product_category');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN product_category VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_production_order' AND COLUMN_NAME='pattern_maker');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN pattern_maker VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_style_info ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='size_color_config');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN size_color_config TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='image_insight');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN image_insight TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='skc');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN skc VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='development_source_type');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN development_source_type VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='development_source_detail');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN development_source_detail VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pushed_to_order');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN pushed_to_order INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pushed_to_order_time');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN pushed_to_order_time DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pushed_by_name');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN pushed_by_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='customer');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN customer VARCHAR(200) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='fabric_composition');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN fabric_composition VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='wash_instructions');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN wash_instructions TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='u_code');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN u_code VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='wash_temp_code');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN wash_temp_code VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='bleach_code');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN bleach_code VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='tumble_dry_code');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN tumble_dry_code VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='iron_code');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN iron_code VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='dry_clean_code');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN dry_clean_code VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='fabric_composition_parts');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN fabric_composition_parts TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='description_locked');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN description_locked INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='description_return_comment');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN description_return_comment VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='description_return_by');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN description_return_by VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='description_return_time');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN description_return_time DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pattern_rev_locked');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN pattern_rev_locked INT DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pattern_rev_return_comment');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN pattern_rev_return_comment VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pattern_rev_return_by');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN pattern_rev_return_by VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pattern_rev_return_time');
SET @s = IF(@col=0, 'ALTER TABLE t_style_info ADD COLUMN pattern_rev_return_time DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_style_bom ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='pattern_size_usage_map');
SET @s = IF(@col=0, 'ALTER TABLE t_style_bom ADD COLUMN pattern_size_usage_map TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='size_spec_map');
SET @s = IF(@col=0, 'ALTER TABLE t_style_bom ADD COLUMN size_spec_map TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='pattern_unit');
SET @s = IF(@col=0, 'ALTER TABLE t_style_bom ADD COLUMN pattern_unit VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='conversion_rate');
SET @s = IF(@col=0, 'ALTER TABLE t_style_bom ADD COLUMN conversion_rate DECIMAL(12,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='group_name');
SET @s = IF(@col=0, 'ALTER TABLE t_style_bom ADD COLUMN group_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='fabric_weight');
SET @s = IF(@col=0, 'ALTER TABLE t_style_bom ADD COLUMN fabric_weight VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='fabric_composition');
SET @s = IF(@col=0, 'ALTER TABLE t_style_bom ADD COLUMN fabric_composition VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_style_size ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_size' AND COLUMN_NAME='base_size');
SET @s = IF(@col=0, 'ALTER TABLE t_style_size ADD COLUMN base_size VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_size' AND COLUMN_NAME='grading_rule');
SET @s = IF(@col=0, 'ALTER TABLE t_style_size ADD COLUMN grading_rule TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_material_database ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_database' AND COLUMN_NAME='conversion_rate');
SET @s = IF(@col=0, 'ALTER TABLE t_material_database ADD COLUMN conversion_rate DECIMAL(12,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_material_stock ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='conversion_rate');
SET @s = IF(@col=0, 'ALTER TABLE t_material_stock ADD COLUMN conversion_rate DECIMAL(12,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_cutting_task ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='factory_type');
SET @s = IF(@col=0, 'ALTER TABLE t_cutting_task ADD COLUMN factory_type VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_product_warehousing ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_status');
SET @s = IF(@col=0, 'ALTER TABLE t_product_warehousing ADD COLUMN repair_status VARCHAR(32) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_operator_name');
SET @s = IF(@col=0, 'ALTER TABLE t_product_warehousing ADD COLUMN repair_operator_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_completed_time');
SET @s = IF(@col=0, 'ALTER TABLE t_product_warehousing ADD COLUMN repair_completed_time DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_material_pickup_record ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='fabric_width');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN fabric_width VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='fabric_weight');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN fabric_weight VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='fabric_composition');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN fabric_composition VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ==================== t_style_attachment ====================

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='biz_type');
SET @s = IF(@col=0, 'ALTER TABLE t_style_attachment ADD COLUMN biz_type VARCHAR(128) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
