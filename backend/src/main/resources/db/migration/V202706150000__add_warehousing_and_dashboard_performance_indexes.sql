-- ==========================================================================
-- 补充关键性能索引
-- 背景：ProductWarehousingMapper 的统计查询已从 YEAR()/MONTH() 改为范围查询，
--       但 warehousing_end_time 列缺少索引，范围查询仍需全表扫描。
--       补充联合索引后，入库统计查询可走索引，性能提升 10x+
-- ==========================================================================

DROP PROCEDURE IF EXISTS _add_performance_indexes;
DELIMITER //
CREATE PROCEDURE _add_performance_indexes()
BEGIN
    -- 1. t_product_warehousing: 入库统计核心索引
    --    覆盖查询: WHERE warehousing_end_time >= ? AND warehousing_end_time < ? AND delete_flag=0 AND tenant_id=?
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing'
                   AND INDEX_NAME='idx_pw_warehousing_end_tenant') THEN
        CREATE INDEX idx_pw_warehousing_end_tenant ON t_product_warehousing(warehousing_end_time, tenant_id, delete_flag);
    END IF;

    -- 2. t_product_warehousing: 按订单查入库记录
    --    覆盖查询: WHERE order_id=? AND delete_flag=0 AND tenant_id=?
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing'
                   AND INDEX_NAME='idx_pw_order_tenant') THEN
        CREATE INDEX idx_pw_order_tenant ON t_product_warehousing(order_id, tenant_id, delete_flag);
    END IF;

    -- 3. t_material_outbound_log: 出库统计联合索引（补充 tenant_id）
    --    已有 idx_mol_out_time(outbound_time)，但缺少 tenant_id 联合
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_outbound_log'
                   AND INDEX_NAME='idx_mol_out_time_tenant') THEN
        CREATE INDEX idx_mol_out_time_tenant ON t_material_outbound_log(outbound_time, tenant_id, delete_flag);
    END IF;

    -- 4. t_scan_record: 按时间范围查扫码记录（Dashboard 扫码统计）
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record'
                   AND INDEX_NAME='idx_sr_scan_time_tenant') THEN
        CREATE INDEX idx_sr_scan_time_tenant ON t_scan_record(scan_time, tenant_id, delete_flag);
    END IF;

    -- 5. t_production_order: 交期预警查询
    --    覆盖查询: WHERE delivery_date <= ? AND status NOT IN (...) AND tenant_id=?
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
                   WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order'
                   AND INDEX_NAME='idx_po_delivery_tenant') THEN
        CREATE INDEX idx_po_delivery_tenant ON t_production_order(delivery_date, tenant_id, delete_flag);
    END IF;
END //
DELIMITER ;
CALL _add_performance_indexes();
DROP PROCEDURE IF EXISTS _add_performance_indexes;
