-- ========================================
-- 面料库存表增加金额字段
-- ========================================

USE fashion_supplychain;

-- 1. 检查并添加 unit_price 字段（单价）
SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
      AND TABLE_NAME = 't_material_stock'
      AND COLUMN_NAME = 'unit_price'
);

SET @sql = IF(
    @col_exists = 0,
    'ALTER TABLE t_material_stock ADD COLUMN unit_price DECIMAL(10,2) DEFAULT 0.00 COMMENT ''单价（元）'' AFTER location',
    'SELECT ''unit_price 字段已存在'' AS result'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 检查并添加 total_value 字段（库存总值）
SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
      AND TABLE_NAME = 't_material_stock'
      AND COLUMN_NAME = 'total_value'
);

SET @sql = IF(
    @col_exists = 0,
    'ALTER TABLE t_material_stock ADD COLUMN total_value DECIMAL(12,2) DEFAULT 0.00 COMMENT ''库存总值（元）= quantity * unit_price'' AFTER unit_price',
    'SELECT ''total_value 字段已存在'' AS result'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 检查并添加 last_inbound_date 字段（最后入库日期）
SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
      AND TABLE_NAME = 't_material_stock'
      AND COLUMN_NAME = 'last_inbound_date'
);

SET @sql = IF(
    @col_exists = 0,
    'ALTER TABLE t_material_stock ADD COLUMN last_inbound_date DATETIME COMMENT ''最后入库日期'' AFTER total_value',
    'SELECT ''last_inbound_date 字段已存在'' AS result'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. 检查并添加 last_outbound_date 字段（最后出库日期）
SET @col_exists = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'fashion_supplychain'
      AND TABLE_NAME = 't_material_stock'
      AND COLUMN_NAME = 'last_outbound_date'
);

SET @sql = IF(
    @col_exists = 0,
    'ALTER TABLE t_material_stock ADD COLUMN last_outbound_date DATETIME COMMENT ''最后出库日期'' AFTER last_inbound_date',
    'SELECT ''last_outbound_date 字段已存在'' AS result'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5. 显示表结构确认
SHOW COLUMNS FROM t_material_stock LIKE '%price%';
SHOW COLUMNS FROM t_material_stock LIKE '%value%';
SHOW COLUMNS FROM t_material_stock LIKE '%date%';

SELECT '✅ 字段添加完成！' AS result;
