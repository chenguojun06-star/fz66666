-- 补充高频查询联合索引
-- 解决生产订单、物料采购、扫码记录等模块的分页查询性能问题

-- =============================================
-- 生产订单高频查询索引
-- =============================================

-- 1. 按租户+状态查询（最常用）
SET @c1 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order'
           AND INDEX_NAME='idx_po_tenant_status');
SET @s1 = IF(@c1=0, 'CREATE INDEX idx_po_tenant_status ON t_production_order(tenant_id, status)', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

-- 2. 按租户+工厂查询
SET @c2 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order'
           AND INDEX_NAME='idx_po_tenant_factory');
SET @s2 = IF(@c2=0, 'CREATE INDEX idx_po_tenant_factory ON t_production_order(tenant_id, factory_id)', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. 按租户+款号查询（款式关联）
SET @c3 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order'
           AND INDEX_NAME='idx_po_tenant_style');
SET @s3 = IF(@c3=0, 'CREATE INDEX idx_po_tenant_style ON t_production_order(tenant_id, style_no)', 'SELECT 1');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

-- =============================================
-- 扫码记录高频查询索引
-- =============================================

-- 4. 按订单查询扫码记录（工序进度追踪）
SET @c4 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record'
           AND INDEX_NAME='idx_sr_order_time');
SET @s4 = IF(@c4=0, 'CREATE INDEX idx_sr_order_time ON t_scan_record(order_id, create_time)', 'SELECT 1');
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

-- 5. 按操作员查询扫码记录（工人工资核算）
SET @c5 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record'
           AND INDEX_NAME='idx_sr_operator_time');
SET @s5 = IF(@c5=0, 'CREATE INDEX idx_sr_operator_time ON t_scan_record(operator_id, create_time)', 'SELECT 1');
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

-- 6. 按工序类型查询扫码记录（工艺分析）
SET @c6 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record'
           AND INDEX_NAME='idx_sr_process_time');
SET @s6 = IF(@c6=0, 'CREATE INDEX idx_sr_process_time ON t_scan_record(process_name, create_time)', 'SELECT 1');
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

-- =============================================
-- 物料采购高频查询索引
-- =============================================

-- 7. 按租户+状态查询采购单
SET @c7 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase'
           AND INDEX_NAME='idx_mp_tenant_status');
SET @s7 = IF(@c7=0, 'CREATE INDEX idx_mp_tenant_status ON t_material_purchase(tenant_id, status)', 'SELECT 1');
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

-- 8. 按租户+物料类型查询采购单
SET @c8 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase'
           AND INDEX_NAME='idx_mp_tenant_type');
SET @s8 = IF(@c8=0, 'CREATE INDEX idx_mp_tenant_type ON t_material_purchase(tenant_id, material_type)', 'SELECT 1');
PREPARE stmt8 FROM @s8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;

-- 9. 按供应商查询采购单（采购对账）
SET @c9 = (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase'
           AND INDEX_NAME='idx_mp_supplier');
SET @s9 = IF(@c9=0, 'CREATE INDEX idx_mp_supplier ON t_material_purchase(supplier_id, create_time)', 'SELECT 1');
PREPARE stmt9 FROM @s9; EXECUTE stmt9; DEALLOCATE PREPARE stmt9;

-- =============================================
-- 裁剪任务索引
-- =============================================

-- 10. 按订单查询裁剪任务
SET @c10 = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task'
            AND INDEX_NAME='idx_ct_order_time');
SET @s10 = IF(@c10=0, 'CREATE INDEX idx_ct_order_time ON t_cutting_task(order_id, create_time)', 'SELECT 1');
PREPARE stmt10 FROM @s10; EXECUTE stmt10; DEALLOCATE PREPARE stmt10;

-- 11. 按租户+接收状态查询裁剪任务
SET @c11 = (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_cutting_task'
            AND INDEX_NAME='idx_ct_tenant_received');
SET @s11 = IF(@c11=0, 'CREATE INDEX idx_ct_tenant_received ON t_cutting_task(tenant_id, received, create_time)', 'SELECT 1');
PREPARE stmt11 FROM @s11; EXECUTE stmt11; DEALLOCATE PREPARE stmt11;
