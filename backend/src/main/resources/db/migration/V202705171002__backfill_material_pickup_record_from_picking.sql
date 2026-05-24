-- ============================================================
-- V202705171002 防御式重写：对已完成的 PICK 领料记录补建 t_material_pickup_record
-- 旧版 confirmPickingOutbound 未调用 syncPickupRecordAfterOutbound
-- 导致审核→应收→收款链路断裂
-- 前置依赖: V202705171001 已补上缺失的16列
-- 防御策略: 动态 SQL + 前置列存在性检查 + COLLATE 统一排序规则
-- ============================================================

SET @dbname = DATABASE();

SET @pr_ready = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record'
    AND COLUMN_NAME IN ('movement_type','source_type','usage_type','source_record_id','source_document_no',
        'receiver_id','receiver_name','issuer_id','issuer_name','warehouse_location',
        'factory_id','factory_name','factory_type'));

SET @pk_ready = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_picking'
    AND COLUMN_NAME IN ('pickup_type','usage_type'));

SET @s = IF(@pr_ready >= 13 AND @pk_ready >= 2,
    'INSERT INTO t_material_pickup_record (id, tenant_id, pickup_no, pickup_type, movement_type, source_type, usage_type, source_record_id, source_document_no, order_no, style_no, material_id, material_code, material_name, material_type, color, specification, fabric_width, fabric_weight, fabric_composition, quantity, unit, unit_price, amount, picker_id, picker_name, pickup_time, receiver_id, receiver_name, issuer_id, issuer_name, warehouse_location, audit_status, finance_status, remark, factory_id, factory_name, factory_type, create_time, update_time, delete_flag) SELECT REPLACE(UUID(), ''-'', '''') AS id, mp.tenant_id, CONCAT(''PK'', DATE_FORMAT(mp.create_time, ''%Y%m%d''), LPAD(ROW_NUMBER() OVER (PARTITION BY DATE(mp.create_time) ORDER BY mp.create_time, pi.id), 4, ''0'')) AS pickup_no, COALESCE(mp.pickup_type, ''INTERNAL'') AS pickup_type, ''OUTBOUND'' AS movement_type, ''PICKING_OUTBOUND'' AS source_type, COALESCE(mp.usage_type, ''BULK'') AS usage_type, mp.id AS source_record_id, mp.picking_no AS source_document_no, mp.order_no, mp.style_no, pi.material_id, pi.material_code, pi.material_name, pi.material_type, pi.color, pi.specification, pi.fabric_width, NULL AS fabric_weight, pi.fabric_composition, pi.quantity, pi.unit, pi.unit_price, CASE WHEN pi.quantity IS NOT NULL AND pi.unit_price IS NOT NULL THEN ROUND(pi.quantity * pi.unit_price, 2) ELSE NULL END AS amount, mp.picker_id, mp.picker_name, mp.create_time AS pickup_time, mp.picker_id AS receiver_id, mp.picker_name AS receiver_name, COALESCE(ol.operator_id, mp.picker_id) AS issuer_id, COALESCE(ol.operator_name, mp.picker_name) AS issuer_name, pi.warehouse_location, ''PENDING'' AS audit_status, ''PENDING'' AS finance_status, CONCAT(''AUTO_BACKFILL|pickingNo='', mp.picking_no, ''|itemId='', pi.id) AS remark, po.factory_id, po.factory_name, po.factory_type, mp.create_time, NOW() AS update_time, 0 AS delete_flag FROM t_material_picking mp JOIN t_material_picking_item pi ON pi.picking_id COLLATE utf8mb4_unicode_ci = mp.id COLLATE utf8mb4_unicode_ci LEFT JOIN t_production_order po ON po.id COLLATE utf8mb4_unicode_ci = mp.order_id COLLATE utf8mb4_unicode_ci AND po.delete_flag = 0 LEFT JOIN t_material_outbound_log ol ON ol.remark COLLATE utf8mb4_unicode_ci LIKE CONCAT(''%pickingNo='', mp.picking_no COLLATE utf8mb4_unicode_ci, ''%'') AND ol.delete_flag = 0 AND ol.id = (SELECT MIN(ol2.id) FROM t_material_outbound_log ol2 WHERE ol2.remark COLLATE utf8mb4_unicode_ci LIKE CONCAT(''%pickingNo='', mp.picking_no COLLATE utf8mb4_unicode_ci, ''%'') AND ol2.delete_flag = 0) WHERE mp.picking_no COLLATE utf8mb4_unicode_ci LIKE ''PICK-%'' AND mp.delete_flag = 0 AND mp.status = ''completed'' AND NOT EXISTS (SELECT 1 FROM t_material_pickup_record pr WHERE pr.source_record_id COLLATE utf8mb4_unicode_ci = mp.id COLLATE utf8mb4_unicode_ci AND pr.delete_flag = 0)',
    'SELECT ''SKIP: V202705171002 prerequisites not met (pickup_record_cols='' AS info, @pr_ready, @pk_ready');

PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
