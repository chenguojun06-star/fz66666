-- V202706260002__cleanup_duplicate_indexes.sql
-- 清理核心表的完全重复索引（P0优化：提升写入性能，减少存储空间）
-- 幂等：使用存储过程判断索引存在才删除

DELIMITER $$

DROP PROCEDURE IF EXISTS drop_index_if_exists $$

CREATE PROCEDURE drop_index_if_exists(
    IN p_table_name VARCHAR(128),
    IN p_index_name VARCHAR(128)
)
BEGIN
    DECLARE index_exists INT DEFAULT 0;

    SELECT COUNT(*) INTO index_exists
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = p_table_name
      AND index_name = p_index_name;

    IF index_exists > 0 THEN
        SET @sql = CONCAT('ALTER TABLE ', p_table_name, ' DROP INDEX ', p_index_name);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

-- ============================================
-- t_production_order (35个索引 → 清理11个重复)
-- ============================================
CALL drop_index_if_exists('t_production_order', 'idx_created_by_id');
CALL drop_index_if_exists('t_production_order', 'idx_po_created_by_id');
CALL drop_index_if_exists('t_production_order', 'idx_production_factory_id');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_factory');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_factory_id');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_factory_status');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_status');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_status_delete');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_style_no');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_tenant');
CALL drop_index_if_exists('t_production_order', 'idx_production_order_tenant_id');

-- ============================================
-- t_scan_record (37个索引 → 清理7个重复)
-- ============================================
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_order');
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_order_id');
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_order_no');
CALL drop_index_if_exists('t_scan_record', 'idx_request_id');
CALL drop_index_if_exists('t_scan_record', 'idx_scan_time_tenant_lookup');
CALL drop_index_if_exists('t_scan_record', 'idx_scan_record_tenant');
CALL drop_index_if_exists('t_scan_record', 'idx_sr_tenant_scantime');

-- ============================================
-- t_cutting_bundle (23个索引 → 清理6个重复)
-- ============================================
CALL drop_index_if_exists('t_cutting_bundle', 'idx_cb_creator_id');
CALL drop_index_if_exists('t_cutting_bundle', 'idx_cb_operator_id');
CALL drop_index_if_exists('t_cutting_bundle', 'idx_cutting_order_id');
CALL drop_index_if_exists('t_cutting_bundle', 'idx_cutting_bundle_order_no');
CALL drop_index_if_exists('t_cutting_bundle', 'idx_cutting_bundle_qr_code');
CALL drop_index_if_exists('t_cutting_bundle', 'idx_cutting_bundle_tenant');

-- ============================================
-- t_product_warehousing (25个索引 → 清理4个重复)
-- ============================================
CALL drop_index_if_exists('t_product_warehousing', 'idx_product_warehousing_order');
CALL drop_index_if_exists('t_product_warehousing', 'idx_pw_order_id');
CALL drop_index_if_exists('t_product_warehousing', 'idx_warehousing_order_id');
CALL drop_index_if_exists('t_product_warehousing', 'idx_product_warehousing_tenant');

-- ============================================
-- t_material_purchase (18个索引 → 清理3个重复)
-- ============================================
CALL drop_index_if_exists('t_material_purchase', 'idx_mpu_creator_id');
CALL drop_index_if_exists('t_material_purchase', 'idx_mpu_inbound_record_id');
CALL drop_index_if_exists('t_material_purchase', 'idx_material_purchase_order_id_v2');

-- ============================================
-- t_product_outstock (17个索引 → 清理4个重复)
-- ============================================
CALL drop_index_if_exists('t_product_outstock', 'idx_pos_creator_id');
CALL drop_index_if_exists('t_product_outstock', 'idx_pos_operator_id');
CALL drop_index_if_exists('t_product_outstock', 'idx_outstock_order_id');
CALL drop_index_if_exists('t_product_outstock', 'idx_t_product_outstock_tenant_id');

-- ============================================
-- t_cutting_task (13个索引 → 清理2个重复)
-- ============================================
CALL drop_index_if_exists('t_cutting_task', 'idx_ct_creator_id');
CALL drop_index_if_exists('t_cutting_task', 'idx_cutting_task_prod_order_id');

-- 清理存储过程
DROP PROCEDURE IF EXISTS drop_index_if_exists;
