-- ============================================================
-- V202708161300 商品编码表增加排序列 sort_order
-- 背景：商品编码(SKU)需支持码数从小到大自动排序 + 用户拖拽自定义顺序
-- 影响范围：t_product_sku 表结构，新增列默认 0（未自定义排序）
-- 回滚方案：ALTER TABLE t_product_sku DROP COLUMN sort_order;
-- ============================================================

-- MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，用 information_schema 条件执行
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_product_sku'
    AND COLUMN_NAME = 'sort_order'
);
SET @ddl = IF(@col_exists = 0,
  'ALTER TABLE t_product_sku ADD COLUMN sort_order INT DEFAULT 0 COMMENT ''自定义排序（0=未自定义，按尺码语义排序）''',
  'SELECT 1');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
