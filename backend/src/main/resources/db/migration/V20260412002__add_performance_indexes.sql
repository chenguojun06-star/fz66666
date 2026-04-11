DROP PROCEDURE IF EXISTS `__mig_V20260412002__add_performance_indexes`;
DELIMITER $$
CREATE PROCEDURE `__mig_V20260412002__add_performance_indexes`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;

    -- t_scan_record: 按 order_id 查询扫码记录（工资聚合、订单详情等场景）
    CREATE INDEX idx_scan_record_order_id
    ON t_scan_record(order_id);

    -- t_scan_record: 按 scan_type + scan_result 组合查询（工资统计过滤成功生产/裁剪记录）
    CREATE INDEX idx_scan_record_scan_type_result
    ON t_scan_record(scan_type, scan_result);

    -- t_material_purchase: 按 order_id 查询采购记录
    CREATE INDEX idx_material_purchase_order_id_v2
    ON t_material_purchase(order_id);

    -- t_production_order: 按 status + delete_flag 组合查询（列表过滤、状态统计）
    CREATE INDEX idx_production_order_status_delete
    ON t_production_order(status, delete_flag);

    -- t_cutting_bundle: 按 production_order_no 查询裁剪床次
    CREATE INDEX idx_cutting_bundle_order_no
    ON t_cutting_bundle(production_order_no);

END$$
DELIMITER ;
CALL `__mig_V20260412002__add_performance_indexes`();
DROP PROCEDURE IF EXISTS `__mig_V20260412002__add_performance_indexes`;
