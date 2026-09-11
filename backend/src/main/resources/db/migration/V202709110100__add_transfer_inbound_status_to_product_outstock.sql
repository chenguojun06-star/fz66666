-- D-360n：调拨出库支持回入库——出库记录标记是否已回入（调入方确认收货）
ALTER TABLE t_product_outstock
    ADD COLUMN transfer_inbound_status VARCHAR(32) DEFAULT NULL COMMENT '调拨回入库状态：INBOUND=已回入' AFTER platform_code;
