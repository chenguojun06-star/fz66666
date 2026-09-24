-- D-532：电商订单接入组合商品（套装）。
-- 平台侧把组合商品作为独立商品上架（商品编码 = t_combo_product.combo_code），
-- 订单同步/接单时按 combo_code 识别：订单挂 combo_id/combo_code，
-- 现货直发时按子SKU逐个扣库存（复用 /warehouse/finished-inventory/combo-outbound 的套装出库链路），
-- 出库明细每子SKU一行、共一张出库单号、行挂组合溯源三列。

-- 幂等：先查 information_schema 再 ADD COLUMN（与 V202709240001 同一写法）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_ecommerce_order'
               AND COLUMN_NAME  = 'combo_id') = 0,
    'ALTER TABLE `t_ecommerce_order` ADD COLUMN `combo_id` bigint DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_ecommerce_order'
               AND COLUMN_NAME  = 'combo_code') = 0,
    'ALTER TABLE `t_ecommerce_order` ADD COLUMN `combo_code` varchar(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
