-- D-362h：成品出库 order_id/order_no 放开非空——
-- D-362b「关联订单按用料场景必填（仅大货用料必填）」落地后，样衣/备库/直发客户等
-- 无订单出库是合法场景；但 FinanceTableMigrator 建表遗留 order_id/order_no NOT NULL 无默认值，
-- 插入时传 null 直接抛 Field 'order_id' doesn't have a default value → 500「数据访问失败」。
-- 入库表 t_product_warehousing 同两列此前已放开可空，本迁移把出库表对齐。
-- 幂等：MODIFY 为可空重复执行结果一致。

ALTER TABLE t_product_outstock MODIFY COLUMN order_id VARCHAR(36) NULL COMMENT '订单ID';
ALTER TABLE t_product_outstock MODIFY COLUMN order_no VARCHAR(50) NULL COMMENT '订单号';
