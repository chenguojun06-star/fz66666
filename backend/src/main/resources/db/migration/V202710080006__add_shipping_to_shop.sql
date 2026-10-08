-- D-513：店铺配送费（运费）体系
--
-- 背景（逻辑矛盾）：C 端店铺页**硬编码写着「包邮」「7 天无理由」**，
-- 但系统里**根本没有运费概念** —— 下单金额永远等于商品金额，
-- 商家一旦要收运费就无路可走，页面还在承诺包邮。这是必须修的逻辑断层。
--
-- 设计（规则简单、可解释、商家可配）：
--   shipping_enabled = 0            → 全场包邮（默认，与现状页面承诺一致）
--   shipping_enabled = 1 且 满额包邮门槛>0 且 商品金额≥门槛 → 包邮
--   shipping_enabled = 1 且 未达门槛  → 收默认运费
--
-- 订单侧拆出「商品金额」与「运费」两列，便于对账（total_amount 仍 = 两者之和）。
--
-- ⚠️ 动态 SQL 内不得出现 ASCII 字符串字面量（Flyway 会截断），故只加可空/数值列，
-- 默认值统一走「加列后独立 UPDATE 回填」。

-- ── 1. t_shop_config：配送设置 ────────────────────────────────────────────
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_config' AND COLUMN_NAME = 'shipping_enabled');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_config ADD COLUMN shipping_enabled TINYINT NULL COMMENT ''是否收取运费 1收 0全场包邮'' AFTER enabled', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_config' AND COLUMN_NAME = 'shipping_fee');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_config ADD COLUMN shipping_fee DECIMAL(10,2) NULL COMMENT ''默认运费'' AFTER shipping_enabled', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_config' AND COLUMN_NAME = 'free_shipping_threshold');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_config ADD COLUMN free_shipping_threshold DECIMAL(10,2) NULL COMMENT ''满额包邮门槛，0=无'' AFTER shipping_fee', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_config' AND COLUMN_NAME = 'shipping_note');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_config ADD COLUMN shipping_note VARCHAR(255) NULL COMMENT ''配送说明（买家可见）'' AFTER free_shipping_threshold', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. t_shop_order：商品金额 / 运费拆分 ──────────────────────────────────
SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'goods_amount');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN goods_amount DECIMAL(12,2) NULL COMMENT ''商品金额（不含运费）'' AFTER total_amount', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c := (SELECT COUNT(*) FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_shop_order' AND COLUMN_NAME = 'shipping_fee');
SET @s := IF(@c = 0, 'ALTER TABLE t_shop_order ADD COLUMN shipping_fee DECIMAL(12,2) NULL COMMENT ''运费'' AFTER goods_amount', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 3. 历史数据回填 ──────────────────────────────────────────────────────
-- 3.1 老订单没有运费：商品金额 = 订单金额，运费 = 0（当时就是「无运费」语义）
UPDATE t_shop_order SET goods_amount = total_amount WHERE goods_amount IS NULL;
UPDATE t_shop_order SET shipping_fee = 0 WHERE shipping_fee IS NULL;

-- 3.2 店铺配送设置默认值：全场包邮（与现有 C 端页面「包邮」承诺保持一致，
--     避免升级后突然对老顾客产生运费）
UPDATE t_shop_config SET shipping_enabled = 0 WHERE shipping_enabled IS NULL;
UPDATE t_shop_config SET shipping_fee = 0 WHERE shipping_fee IS NULL;
UPDATE t_shop_config SET free_shipping_threshold = 0 WHERE free_shipping_threshold IS NULL;
