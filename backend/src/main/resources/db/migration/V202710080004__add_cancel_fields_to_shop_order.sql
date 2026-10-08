-- D-513：店铺订单取消能力补齐
--
-- 背景：t_shop_order 的 status 早已含 CANCELLED，但**没有任何地方能把订单取消掉**
-- （ShopAdminController 无取消接口），是个"有状态无出口"的死状态；
-- 且取消需要留痕（谁取消、为什么取消、什么时候），否则售后对账无从追溯。
--
-- 本迁移只加「取消信息」两列，幂等可重跑。
--   cancel_reason 取消原因
--   cancel_time   取消时间

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'cancel_reason');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN cancel_reason VARCHAR(255) NULL COMMENT ''取消原因'' AFTER ship_time', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'cancel_time');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN cancel_time DATETIME NULL COMMENT ''取消时间'' AFTER cancel_reason', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 店铺订单查询主路径：租户 + 状态 + 创建时间倒序（列表/统计都走这个组合）
SET @c := (SELECT COUNT(*) FROM information_schema.STATISTICS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND INDEX_NAME = 'idx_shop_order_tenant_status_time');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD INDEX idx_shop_order_tenant_status_time (tenant_id, status, create_time)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
