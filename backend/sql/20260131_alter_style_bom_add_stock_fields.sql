-- ==========================================
-- BOM表添加库存检查字段
-- 创建时间: 2026-01-31
-- 用途: 支持BOM创建时自动检查库存状态
-- ==========================================

-- 添加库存检查相关字段（先检查是否存在）
SET @col1_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
    AND TABLE_NAME = 't_style_bom'
    AND COLUMN_NAME = 'stock_status');

SET @sql1 = IF(@col1_exists = 0,
    'ALTER TABLE t_style_bom ADD COLUMN stock_status VARCHAR(20) COMMENT ''库存状态：sufficient=充足, insufficient=不足, none=无库存, unchecked=未检查'' AFTER remark',
    'SELECT ''字段 stock_status 已存在'' AS message');
PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @col2_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
    AND TABLE_NAME = 't_style_bom'
    AND COLUMN_NAME = 'available_stock');

SET @sql2 = IF(@col2_exists = 0,
    'ALTER TABLE t_style_bom ADD COLUMN available_stock INT COMMENT ''可用库存数量（quantity - locked_quantity）'' AFTER stock_status',
    'SELECT ''字段 available_stock 已存在'' AS message');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @col3_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
    AND TABLE_NAME = 't_style_bom'
    AND COLUMN_NAME = 'required_purchase');

SET @sql3 = IF(@col3_exists = 0,
    'ALTER TABLE t_style_bom ADD COLUMN required_purchase INT COMMENT ''需采购数量（需求量 - 可用库存，最小为0）'' AFTER available_stock',
    'SELECT ''字段 required_purchase 已存在'' AS message');
PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- 验证字段添加成功
SELECT
    '库存检查字段添加成功' AS status,
    (SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = 'fashion_supplychain'
     AND TABLE_NAME = 't_style_bom'
     AND COLUMN_NAME IN ('stock_status', 'available_stock', 'required_purchase')) AS added_columns;
