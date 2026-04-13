-- =============================================================================
-- V202604141400__fix_order_no_unique_key_per_tenant.sql
-- 修复订单号唯一索引 —— 从全局唯一改为按租户唯一
--
-- 根因：order_no 列有全局 UNIQUE KEY，但 SerialOrchestrator 按租户查重（TenantInterceptor），
-- 多租户环境下不同租户生成同日期序号（如 PO20260414001）会冲突 → DuplicateKeyException → HTTP 409。
-- 修复：改为 (tenant_id, order_no) 复合唯一索引，允许不同租户拥有相同订单号。
-- =============================================================================

-- 1. 删除全局唯一索引 order_no（如果存在）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND INDEX_NAME = 'order_no') > 0,
    'ALTER TABLE `t_production_order` DROP INDEX `order_no`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 创建按租户唯一的复合索引 (tenant_id, order_no)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND INDEX_NAME = 'uk_tenant_order_no') = 0,
    'ALTER TABLE `t_production_order` ADD UNIQUE KEY `uk_tenant_order_no` (`tenant_id`, `order_no`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. 清理冗余的普通索引（order_no 列存在 3 个重复索引，保留 1 个即可）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND INDEX_NAME = 'idx_production_order_no') > 0,
    'ALTER TABLE `t_production_order` DROP INDEX `idx_production_order_no`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_production_order' AND INDEX_NAME = 'idx_production_order_order_no') > 0,
    'ALTER TABLE `t_production_order` DROP INDEX `idx_production_order_order_no`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
