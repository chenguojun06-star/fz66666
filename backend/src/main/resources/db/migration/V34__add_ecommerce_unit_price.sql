-- 补充电商订单单价字段（件单价，区别于 total_amount 总金额）
-- 本地 Flyway 自动执行；云端需手动在控制台执行
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS，直接 ADD COLUMN（首次执行安全）
ALTER TABLE t_ecommerce_order
    ADD COLUMN unit_price DECIMAL(10,2) DEFAULT NULL COMMENT '商品单价（元/件）';
