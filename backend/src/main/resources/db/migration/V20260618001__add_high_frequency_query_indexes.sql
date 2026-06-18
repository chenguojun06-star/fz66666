-- V20260618001: 补充高频查询联合索引
-- 防御式执行：每个索引创建前检查"索引不存在 AND 所有列都存在"
-- 依赖 V20260617005（已提前添加 t_scan_record/t_cutting_task 的缺失列）

-- =============================================
-- 生产订单高频查询索引
-- =============================================

-- 1. idx_po_tenant_status
SET @idx1 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND INDEX_NAME='idx_po_tenant_status');
SET @col1a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='tenant_id');
SET @col1b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='status');
SET @s1 = IF(@idx1=0 AND @col1a>0 AND @col1b>0,
    'CREATE INDEX idx_po_tenant_status ON t_production_order(tenant_id, status)',
    'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

-- 2. idx_po_tenant_factory
SET @idx2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND INDEX_NAME='idx_po_tenant_factory');
SET @col2a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='tenant_id');
SET @col2b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_id');
SET @s2 = IF(@idx2=0 AND @col2a>0 AND @col2b>0,
    'CREATE INDEX idx_po_tenant_factory ON t_production_order(tenant_id, factory_id)',
    'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. idx_po_tenant_style
SET @idx3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND INDEX_NAME='idx_po_tenant_style');
SET @col3a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='tenant_id');
SET @col3b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='style_no');
SET @s3 = IF(@idx3=0 AND @col3a>0 AND @col3b>0,
    'CREATE INDEX idx_po_tenant_style ON t_production_order(tenant_id, style_no)',
    'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- =============================================
-- 扫码记录高频查询索引
-- =============================================

-- 4. idx_sr_order_time
SET @idx4 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_order_time');
SET @col4a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='order_id');
SET @col4b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='create_time');
SET @s4 = IF(@idx4=0 AND @col4a>0 AND @col4b>0,
    'CREATE INDEX idx_sr_order_time ON t_scan_record(order_id, create_time)',
    'SELECT 1');
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- 5. idx_sr_operator_time
SET @idx5 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_operator_time');
SET @col5a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='operator_id');
SET @col5b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='create_time');
SET @s5 = IF(@idx5=0 AND @col5a>0 AND @col5b>0,
    'CREATE INDEX idx_sr_operator_time ON t_scan_record(operator_id, create_time)',
    'SELECT 1');
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

-- 6. idx_sr_process_time
SET @idx6 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_process_time');
SET @col6a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='process_name');
SET @col6b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='create_time');
SET @s6 = IF(@idx6=0 AND @col6a>0 AND @col6b>0,
    'CREATE INDEX idx_sr_process_time ON t_scan_record(process_name, create_time)',
    'SELECT 1');
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- =============================================
-- 物料采购高频查询索引
-- =============================================

-- 7. idx_mp_tenant_status
SET @idx7 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND INDEX_NAME='idx_mp_tenant_status');
SET @col7a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='tenant_id');
SET @col7b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='status');
SET @s7 = IF(@idx7=0 AND @col7a>0 AND @col7b>0,
    'CREATE INDEX idx_mp_tenant_status ON t_material_purchase(tenant_id, status)',
    'SELECT 1');
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

-- 8. idx_mp_tenant_type
SET @idx8 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND INDEX_NAME='idx_mp_tenant_type');
SET @col8a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='tenant_id');
SET @col8b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='material_type');
SET @s8 = IF(@idx8=0 AND @col8a>0 AND @col8b>0,
    'CREATE INDEX idx_mp_tenant_type ON t_material_purchase(tenant_id, material_type)',
    'SELECT 1');
PREPARE stmt8 FROM @s8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;

-- 9. idx_mp_supplier
SET @idx9 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND INDEX_NAME='idx_mp_supplier');
SET @col9a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='supplier_id');
SET @col9b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='create_time');
SET @s9 = IF(@idx9=0 AND @col9a>0 AND @col9b>0,
    'CREATE INDEX idx_mp_supplier ON t_material_purchase(supplier_id, create_time)',
    'SELECT 1');
PREPARE stmt9 FROM @s9; EXECUTE stmt9; DEALLOCATE PREPARE stmt9;

-- =============================================
-- 裁剪任务索引
-- =============================================

-- 10. idx_ct_order_time
SET @idx10 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND INDEX_NAME='idx_ct_order_time');
SET @col10a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='order_id');
SET @col10b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='create_time');
SET @s10 = IF(@idx10=0 AND @col10a>0 AND @col10b>0,
    'CREATE INDEX idx_ct_order_time ON t_cutting_task(order_id, create_time)',
    'SELECT 1');
PREPARE stmt10 FROM @s10; EXECUTE stmt10; DEALLOCATE PREPARE stmt10;

-- 11. idx_ct_tenant_received
SET @idx11 = (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND INDEX_NAME='idx_ct_tenant_received');
SET @col11a = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='tenant_id');
SET @col11b = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='received');
SET @col11c = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task' AND COLUMN_NAME='create_time');
SET @s11 = IF(@idx11=0 AND @col11a>0 AND @col11b>0 AND @col11c>0,
    'CREATE INDEX idx_ct_tenant_received ON t_cutting_task(tenant_id, received, create_time)',
    'SELECT 1');
PREPARE stmt11 FROM @s11; EXECUTE stmt11; DEALLOCATE PREPARE stmt11;
