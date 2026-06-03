-- V20260603: 大货订单新增 sku 字段（款号+颜色+尺码组合），同时保证 size 字段可编辑
-- 背景：用户要求大货订单能编辑 SKU 字段（区别于 SKC = 款号+颜色），便于多色多码管理
-- 幂等写法：INFORMATION_SCHEMA 判断，安全可重复执行

-- ① t_production_order.sku（SKU 编号：款号+颜色+尺码）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'sku') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `sku` VARCHAR(128) DEFAULT NULL COMMENT ''SKU 编号（款号+颜色+尺码组合）'' AFTER `skc`',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② t_production_order 索引：便于按 SKU 查询订单
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND INDEX_NAME   = 'idx_production_order_sku') = 0,
    'CREATE INDEX `idx_production_order_sku` ON `t_production_order` (`sku`)',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
