-- ============================================================
-- V202606110000: 补齐 t_ec_universal_stock 的 sku_code 列 + 相关索引
-- 背景：V202606101000 创建 t_ec_universal_stock 时未包含 sku_code，
--       但实体 EcUniversalStock.java 已有 skuCode 字段。
--       此外 t_product_warehousing / t_product_outstock 需要 sku_code 索引以加速查询。
-- 安全：使用 INFORMATION_SCHEMA 守卫 + SET @s 动态 SQL（已在 V20260606 等脚本验证可用）。
--       动态 SQL 内不含 COMMENT ''字符串'' 或 DEFAULT '字符串' 字面量（V202705300003 验证的陷阱）。
-- ============================================================

-- 1. t_ec_universal_stock 补齐 sku_code 列（若缺失）
SET @s = (SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE t_ec_universal_stock ADD COLUMN sku_code VARCHAR(100) AFTER sku_id',
    'SELECT 1'
) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_ec_universal_stock'
     AND COLUMN_NAME = 'sku_code');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. t_ec_universal_stock 补齐 (tenant_id, sku_code) 联合索引
SET @s = (SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE t_ec_universal_stock ADD INDEX idx_tenant_sku_code(tenant_id, sku_code)',
    'SELECT 1'
) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_ec_universal_stock'
     AND INDEX_NAME = 'idx_tenant_sku_code');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. t_product_warehousing 补齐 (tenant_id, sku_code, warehouse) 联合索引
SET @s = (SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE t_product_warehousing ADD INDEX idx_tenant_sku_code_wh(tenant_id, sku_code, warehouse)',
    'SELECT 1'
) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_product_warehousing'
     AND INDEX_NAME = 'idx_tenant_sku_code_wh');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4. t_product_outstock 补齐 (tenant_id, sku_code, warehouse) 联合索引
SET @s = (SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE t_product_outstock ADD INDEX idx_tenant_sku_code_wh(tenant_id, sku_code, warehouse)',
    'SELECT 1'
) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_product_outstock'
     AND INDEX_NAME = 'idx_tenant_sku_code_wh');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
