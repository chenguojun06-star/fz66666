ALTER TABLE t_factory_shipment ADD COLUMN received_quantity INT DEFAULT NULL COMMENT '实际到货数量（点货数量，可不同于发货数量）';
