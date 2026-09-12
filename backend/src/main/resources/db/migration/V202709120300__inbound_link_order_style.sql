-- D-362b：入库记录关联采购来源——大货挂订单号、样衣挂款号（批量采购可空）
-- 幂等加固：本脚本曾在云端部分执行（DDL 逐条自动提交，order_no 已落库但脚本未记成功），
-- 非幂等 ALTER 导致每次启动重复执行撞 Duplicate column name 'order_no'，后端起不来。
-- 改为存储过程包裹，已存在的列自动跳过（范式同 V202608250005）。
DELIMITER //
CREATE PROCEDURE safe_add_inbound_link_columns()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 't_material_inbound'
        AND column_name = 'order_no'
    ) THEN
        ALTER TABLE t_material_inbound ADD COLUMN order_no VARCHAR(64) DEFAULT NULL COMMENT '关联订单号(大货采购)' AFTER purchase_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 't_material_inbound'
        AND column_name = 'style_no'
    ) THEN
        ALTER TABLE t_material_inbound ADD COLUMN style_no VARCHAR(64) DEFAULT NULL COMMENT '关联款号(样衣/大货采购)' AFTER order_no;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 't_material_inbound'
        AND column_name = 'source_type'
    ) THEN
        ALTER TABLE t_material_inbound ADD COLUMN source_type VARCHAR(32) DEFAULT NULL COMMENT '采购来源: order/sample/batch' AFTER style_no;
    END IF;
END //
DELIMITER ;
CALL safe_add_inbound_link_columns();
DROP PROCEDURE IF EXISTS safe_add_inbound_link_columns;
