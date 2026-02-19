-- 更新 v_production_order_flow_stage_snapshot 视图
-- 包含车缝、大烫、包装环节的操作员信息

DROP VIEW IF EXISTS v_production_order_flow_stage_snapshot;

CREATE VIEW v_production_order_flow_stage_snapshot AS
SELECT
    o.id AS order_id,
    -- 下单节点
    o.create_time AS order_start_time,
    o.create_time AS order_end_time,
    (SELECT u.name FROM t_user u WHERE u.id =
        (SELECT sr.operator_id FROM t_scan_record sr
         WHERE sr.order_id = o.id AND sr.scan_type = 'system'
         ORDER BY sr.scan_time ASC LIMIT 1)
    ) AS order_operator_name,

    -- 采购环节 (从物料采购获取)
    (SELECT MAX(p.actual_arrival_date) FROM t_material_purchase p
     WHERE p.order_id = o.id AND p.status = 'completed' AND p.delete_flag = 0) AS procurement_scan_end_time,
    (SELECT p.receiver_name FROM t_material_purchase p
     WHERE p.order_id = o.id AND p.status = 'completed' AND p.delete_flag = 0
     ORDER BY p.actual_arrival_date DESC LIMIT 1) AS procurement_scan_operator_name,

    -- 裁剪环节 (从扫码记录获取，scan_type='cutting')
    (SELECT MIN(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'cutting' AND sr.scan_result = 'success') AS cutting_start_time,
    (SELECT MAX(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'cutting' AND sr.scan_result = 'success') AS cutting_end_time,
    (SELECT sr.operator_name FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'cutting' AND sr.scan_result = 'success'
     ORDER BY sr.scan_time DESC LIMIT 1) AS cutting_operator_name,
    (SELECT SUM(sr.quantity) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'cutting' AND sr.scan_result = 'success') AS cutting_quantity,

    -- 缝制环节 (旧字段名，保持兼容)
    (SELECT MIN(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.scan_result = 'success') AS sewing_start_time,
    (SELECT MAX(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.scan_result = 'success') AS sewing_end_time,
    (SELECT sr.operator_name FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.scan_result = 'success'
     ORDER BY sr.scan_time DESC LIMIT 1) AS sewing_operator_name,

    -- 车缝环节 (从扫码记录获取，process_name='车缝')
    (SELECT MIN(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name = '车缝' AND sr.scan_result = 'success') AS car_sewing_start_time,
    (SELECT MAX(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name = '车缝' AND sr.scan_result = 'success') AS car_sewing_end_time,
    (SELECT sr.operator_name FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name = '车缝' AND sr.scan_result = 'success'
     ORDER BY sr.scan_time DESC LIMIT 1) AS car_sewing_operator_name,

    -- 大烫/整烫环节 (从扫码记录获取，process_name='大烫' OR '整烫')
    (SELECT MIN(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name IN ('大烫', '整烫') AND sr.scan_result = 'success') AS ironing_start_time,
    (SELECT MAX(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name IN ('大烫', '整烫') AND sr.scan_result = 'success') AS ironing_end_time,
    (SELECT sr.operator_name FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name IN ('大烫', '整烫') AND sr.scan_result = 'success'
     ORDER BY sr.scan_time DESC LIMIT 1) AS ironing_operator_name,

    -- 包装环节 (从扫码记录获取，process_name='包装')
    (SELECT MIN(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name = '包装' AND sr.scan_result = 'success') AS packaging_start_time,
    (SELECT MAX(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name = '包装' AND sr.scan_result = 'success') AS packaging_end_time,
    (SELECT sr.operator_name FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'production' AND sr.process_name = '包装' AND sr.scan_result = 'success'
     ORDER BY sr.scan_time DESC LIMIT 1) AS packaging_operator_name,

    -- 质检环节 (从扫码记录获取，scan_type='quality')
    (SELECT MIN(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'quality' AND sr.scan_result = 'success') AS quality_start_time,
    (SELECT MAX(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'quality' AND sr.scan_result = 'success') AS quality_end_time,
    (SELECT sr.operator_name FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'quality' AND sr.scan_result = 'success'
     ORDER BY sr.scan_time DESC LIMIT 1) AS quality_operator_name,
    (SELECT SUM(sr.quantity) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'quality' AND sr.scan_result = 'success') AS quality_quantity,

    -- 入库环节 (从扫码记录获取，scan_type='warehouse')
    (SELECT MIN(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'warehouse' AND sr.scan_result = 'success') AS warehousing_start_time,
    (SELECT MAX(sr.scan_time) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'warehouse' AND sr.scan_result = 'success') AS warehousing_end_time,
    (SELECT sr.operator_name FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'warehouse' AND sr.scan_result = 'success'
     ORDER BY sr.scan_time DESC LIMIT 1) AS warehousing_operator_name,
    (SELECT SUM(sr.quantity) FROM t_scan_record sr
     WHERE sr.order_id = o.id AND sr.scan_type = 'warehouse' AND sr.scan_result = 'success') AS warehousing_quantity

FROM t_production_order o
WHERE o.delete_flag = 0;
