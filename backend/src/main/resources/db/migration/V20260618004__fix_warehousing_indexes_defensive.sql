-- ==========================================================================
-- 修复 V20260617002 创建索引时引用不存在的 delete_flag 列
-- V20260617002 对 t_scan_record 创建索引时引用了 delete_flag 列，
-- 但该表历史上从未定义此列，导致迁移失败并 BLOCK 所有后续迁移
-- (V202606181000 等)，t_user.position 列始终缺失 → 登录 500。
--
-- 本迁移代替 V20260617002 创建防御式索引：
--   - 先检查每个表的每列是否存在，缺失则降级（去掉该列/单列/跳过）
--   - t_scan_record 历史上无 delete_flag → 自动降级为 (scan_time, tenant_id)
-- 执行前提：V20260617002 已在 flyway_schema_history 标记 FAILED（所以本文件能执行）
-- ==========================================================================

SET @col_pw_df = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='delete_flag');
SET @col_pw_ti = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='tenant_id');
SET @col_pw_wt = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_end_time');
SET @col_pw_oid = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='order_id');

SET @col_mol_df = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_outbound_log' AND COLUMN_NAME='delete_flag');
SET @col_mol_ti = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_outbound_log' AND COLUMN_NAME='tenant_id');
SET @col_mol_ot = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_outbound_log' AND COLUMN_NAME='outbound_time');

SET @col_sr_df = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='delete_flag');
SET @col_sr_ti = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='tenant_id');
SET @col_sr_st = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND COLUMN_NAME='scan_time');

SET @col_po_df = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='delete_flag');
SET @col_po_ti = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='tenant_id');
SET @col_po_dd = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='delivery_date');

-- 1. t_product_warehousing: 入库统计核心索引
SET @idx_pw1 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_warehousing_end_tenant') > 0,
    'SELECT 1',
    IF(@col_pw_wt=1 AND @col_pw_ti=1 AND @col_pw_df=1,
        'CREATE INDEX idx_pw_warehousing_end_tenant ON t_product_warehousing(warehousing_end_time, tenant_id, delete_flag)',
        IF(@col_pw_wt=1 AND @col_pw_ti=1,
            'CREATE INDEX idx_pw_warehousing_end_tenant ON t_product_warehousing(warehousing_end_time, tenant_id)',
            IF(@col_pw_wt=1,
                'CREATE INDEX idx_pw_warehousing_end_tenant ON t_product_warehousing(warehousing_end_time)',
                'SELECT 1'))));
PREPARE stmt FROM @idx_pw1;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. t_product_warehousing: 按订单查入库记录
SET @idx_pw2 = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_order_tenant') > 0,
    'SELECT 1',
    IF(@col_pw_oid=1 AND @col_pw_ti=1 AND @col_pw_df=1,
        'CREATE INDEX idx_pw_order_tenant ON t_product_warehousing(order_id, tenant_id, delete_flag)',
        IF(@col_pw_oid=1 AND @col_pw_ti=1,
            'CREATE INDEX idx_pw_order_tenant ON t_product_warehousing(order_id, tenant_id)',
            IF(@col_pw_oid=1,
                'CREATE INDEX idx_pw_order_tenant ON t_product_warehousing(order_id)',
                'SELECT 1'))));
PREPARE stmt FROM @idx_pw2;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. t_material_outbound_log: 出库统计联合索引（补充 tenant_id）
SET @idx_mol = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_outbound_log' AND INDEX_NAME='idx_mol_out_time_tenant') > 0,
    'SELECT 1',
    IF(@col_mol_ot=1 AND @col_mol_ti=1 AND @col_mol_df=1,
        'CREATE INDEX idx_mol_out_time_tenant ON t_material_outbound_log(outbound_time, tenant_id, delete_flag)',
        IF(@col_mol_ot=1 AND @col_mol_ti=1,
            'CREATE INDEX idx_mol_out_time_tenant ON t_material_outbound_log(outbound_time, tenant_id)',
            IF(@col_mol_ot=1,
                'CREATE INDEX idx_mol_out_time_tenant ON t_material_outbound_log(outbound_time)',
                'SELECT 1'))));
PREPARE stmt FROM @idx_mol;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. t_scan_record: 按时间范围查扫码记录（Dashboard 扫码统计）
--    注意：t_scan_record 历史上从未定义 delete_flag，防御式降级为 (scan_time, tenant_id)
SET @idx_sr = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME='idx_sr_scan_time_tenant') > 0,
    'SELECT 1',
    IF(@col_sr_st=1 AND @col_sr_ti=1 AND @col_sr_df=1,
        'CREATE INDEX idx_sr_scan_time_tenant ON t_scan_record(scan_time, tenant_id, delete_flag)',
        IF(@col_sr_st=1 AND @col_sr_ti=1,
            'CREATE INDEX idx_sr_scan_time_tenant ON t_scan_record(scan_time, tenant_id)',
            IF(@col_sr_st=1,
                'CREATE INDEX idx_sr_scan_time_tenant ON t_scan_record(scan_time)',
                'SELECT 1'))));
PREPARE stmt FROM @idx_sr;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. t_production_order: 交期预警查询
SET @idx_po = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND INDEX_NAME='idx_po_delivery_tenant') > 0,
    'SELECT 1',
    IF(@col_po_dd=1 AND @col_po_ti=1 AND @col_po_df=1,
        'CREATE INDEX idx_po_delivery_tenant ON t_production_order(delivery_date, tenant_id, delete_flag)',
        IF(@col_po_dd=1 AND @col_po_ti=1,
            'CREATE INDEX idx_po_delivery_tenant ON t_production_order(delivery_date, tenant_id)',
            IF(@col_po_dd=1,
                'CREATE INDEX idx_po_delivery_tenant ON t_production_order(delivery_date)',
                'SELECT 1'))));
PREPARE stmt FROM @idx_po;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
