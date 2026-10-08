-- D-513：店铺订单售后（退款/退货）能力补齐
--
-- 背景：店铺模块此前**完全没有售后**——顾客要退货退款时商家无处登记，
-- 只能线下沟通，系统里订单永远停在「已发货」，账与货都对不上。
--
-- 设计说明（重要）：
-- 系统**没有在线支付通道**，所以「退款」是**记账层面**的动作
-- （冲销挂账应收 + 退货则回补库存），实际打款由商家线下完成（微信/银行转账）。
-- 因此这里只记录「已同意退款」的结论与金额，不做资金出账。
--
--   after_sale_status  NONE(无) / APPLIED(已登记待处理) / APPROVED(已同意) / REJECTED(已拒绝)
--   after_sale_type    REFUND_ONLY(仅退款) / RETURN_REFUND(退货退款)
--   after_sale_reason  售后原因（顾客诉求）
--   after_sale_remark  商家处理备注
--   after_sale_time    登记时间
--
-- ⚠️ 注意：ADD COLUMN 的动态 SQL 里**不能带 ASCII 字符串字面量**（如 ''NONE''），
-- Flyway 解析动态 SQL 时会截断，导致默认值丢失。故先加可空列，再用独立 UPDATE 回填。

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'after_sale_status');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN after_sale_status VARCHAR(20) NULL COMMENT ''售后状态'' AFTER cancel_time', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'after_sale_type');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN after_sale_type VARCHAR(20) NULL COMMENT ''售后类型'' AFTER after_sale_status', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'after_sale_reason');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN after_sale_reason VARCHAR(255) NULL COMMENT ''售后原因'' AFTER after_sale_type', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'after_sale_remark');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN after_sale_remark VARCHAR(255) NULL COMMENT ''商家处理备注'' AFTER after_sale_reason', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'after_sale_time');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN after_sale_time DATETIME NULL COMMENT ''售后登记时间'' AFTER after_sale_remark', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 历史数据回填为「无售后」（普通语句，不受动态 SQL 字面量限制）
UPDATE t_shop_order SET after_sale_status = 'NONE' WHERE after_sale_status IS NULL OR after_sale_status = '';
