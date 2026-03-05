-- 为生产订单表增加下单业务类型字段
-- FOB=离岸价交货  ODM=原创设计制造  OEM=代工贴牌  CMT=纯加工
ALTER TABLE t_production_order
    ADD COLUMN order_biz_type VARCHAR(20) NULL COMMENT '下单业务类型：FOB/ODM/OEM/CMT' AFTER factory_name;
