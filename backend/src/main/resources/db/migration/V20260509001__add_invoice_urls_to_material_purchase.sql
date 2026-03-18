-- 幂等：向 t_material_purchase 添加 invoice_urls 列（发票/单据图片URL列表）
-- 使用 INFORMATION_SCHEMA 判断列是否存在，兼容 MySQL 8.0 不支持 IF NOT EXISTS 的 ADD COLUMN 语法
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_material_purchase'
       AND COLUMN_NAME  = 'invoice_urls') = 0,
    'ALTER TABLE `t_material_purchase` ADD COLUMN `invoice_urls` TEXT NULL COMMENT ''发票/单据图片URL列表(JSON数组)，用于财务留底'' AFTER `fabric_composition`',
    'SELECT 1'
);
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
