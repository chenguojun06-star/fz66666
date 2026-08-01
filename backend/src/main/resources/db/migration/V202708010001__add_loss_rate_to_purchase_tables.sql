-- ==================================================================
-- V202708010001: 采购链路持久化 loss_rate（损耗率）
-- ==================================================================
-- 背景：BOM 有 loss_rate 字段，但 t_purchase_cart_item / t_material_purchase
--   均未持久化 loss_rate，生成采购单后无法追溯损耗率。
--   现将 loss_rate 贯通到购物车明细 + 采购单，便于后续对账与成本核算。
--
-- 策略：information_schema 检查列是否存在，存在则跳过
--   （禁止 IF NOT EXISTS，MySQL 8.0 不支持）
--   SET @s 内不含 COMMENT（避免引号冲突导致 Flyway 静默失败），
--   COMMENT 用独立 ALTER MODIFY 追加（幂等可重复执行）
-- 关联：P0 #1 Flyway 强制幂等
-- ==================================================================

-- ── 1. t_purchase_cart_item 表新增 loss_rate 列 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_purchase_cart_item'
       AND COLUMN_NAME  = 'loss_rate') = 0,
    'ALTER TABLE `t_purchase_cart_item` ADD COLUMN `loss_rate` DECIMAL(5,2) DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `t_purchase_cart_item` MODIFY COLUMN `loss_rate` DECIMAL(5,2) DEFAULT 0 COMMENT '损耗率%';

-- ── 2. t_material_purchase 表新增 loss_rate 列 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'loss_rate') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `loss_rate` DECIMAL(5,2) DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `t_material_purchase` MODIFY COLUMN `loss_rate` DECIMAL(5,2) DEFAULT 0 COMMENT '损耗率%';
