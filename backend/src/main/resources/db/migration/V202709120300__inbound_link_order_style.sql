-- D-362b：入库记录关联采购来源——大货挂订单号、样衣挂款号（批量采购可空）
ALTER TABLE t_material_inbound ADD COLUMN order_no VARCHAR(64) DEFAULT NULL COMMENT '关联订单号(大货采购)' AFTER purchase_id;
ALTER TABLE t_material_inbound ADD COLUMN style_no VARCHAR(64) DEFAULT NULL COMMENT '关联款号(样衣/大货采购)' AFTER order_no;
ALTER TABLE t_material_inbound ADD COLUMN source_type VARCHAR(32) DEFAULT NULL COMMENT '采购来源: order/sample/batch' AFTER style_no;
