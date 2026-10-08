-- D-513：店铺订单发货能力补齐
--
-- 背景：C 端店铺订单下单即扣库存、挂应收，但管理端【没有任何发货入口】——
-- t_shop_order 只有 PENDING_SHIP / SHIPPED 两个状态，却没有承载发货信息的字段，
-- ShopAdminController 也没有发货接口。结果：顾客下单后商家无法发货，
-- 订单永远停在「待发货」，电商闭环断在最后一环。
--
-- 本迁移只加「发货信息」三列，幂等可重跑（先判存在再加）。
--   express_company 快递公司（如 顺丰/中通，可空：自提/同城配送可不填）
--   express_no      快递单号（可空）
--   ship_time       发货时间（状态置为 SHIPPED 时写入）

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'express_company');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN express_company VARCHAR(64) NULL COMMENT ''快递公司'' AFTER outstock_no', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'express_no');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN express_no VARCHAR(64) NULL COMMENT ''快递单号'' AFTER express_company', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'ship_time');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN ship_time DATETIME NULL COMMENT ''发货时间'' AFTER express_no', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
