-- 补充电商订单单价字段（件单价，区别于 total_amount 总金额）
-- 本地 Flyway 自动执行；云端需手动在控制台执行
ALTER TABLE t_ecommerce_order
    ADD COLUMN IF NOT EXISTS unit_price DECIMAL(10,2) DEFAULT NULL COMMENT '商品单价（元/件）';
