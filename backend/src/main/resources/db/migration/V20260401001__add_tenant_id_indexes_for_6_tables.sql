-- ============================================================
-- 为6张核心业务表补充 tenant_id 索引（生产环境性能优化）
-- 幂等写法：先通过 INFORMATION_SCHEMA 检测索引是否存在
-- ============================================================

-- 1. t_customer
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_customer' AND INDEX_NAME='idx_customer_tenant_id')=0,
    'CREATE INDEX idx_customer_tenant_id ON t_customer (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. t_receivable
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_receivable' AND INDEX_NAME='idx_receivable_tenant_id')=0,
    'CREATE INDEX idx_receivable_tenant_id ON t_receivable (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. t_finished_product_settlement
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_finished_product_settlement' AND INDEX_NAME='idx_fps_tenant_id')=0,
    'CREATE INDEX idx_fps_tenant_id ON t_finished_product_settlement (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. t_order_transfer
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_order_transfer' AND INDEX_NAME='idx_order_transfer_tenant_id')=0,
    'CREATE INDEX idx_order_transfer_tenant_id ON t_order_transfer (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. t_logistics_order
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_logistics_order' AND INDEX_NAME='idx_logistics_order_tenant_id')=0,
    'CREATE INDEX idx_logistics_order_tenant_id ON t_logistics_order (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. t_ec_sales_revenue
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_sales_revenue' AND INDEX_NAME='idx_ec_sales_revenue_tenant_id')=0,
    'CREATE INDEX idx_ec_sales_revenue_tenant_id ON t_ec_sales_revenue (tenant_id)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
