-- 云端 t_production_order.customer_id 补偿脚本（2026-03-16）
-- 目标：补齐生产订单 CRM 客户关联列，避免后续 CRM/财务联动功能受缺列影响。
-- 说明：本脚本只补列，不做历史数据回填。

SELECT 'step-1: current customer_id status' AS step;

SELECT
  't_production_order' AS table_name,
  CASE WHEN COUNT(*) > 0 THEN 'COLUMN_EXISTS' ELSE 'COLUMN_MISSING' END AS status
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_production_order'
  AND COLUMN_NAME = 'customer_id';


SELECT 'step-2: patch customer_id if missing' AS step;

SET @s = IF((SELECT COUNT(*)
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 't_production_order'
               AND COLUMN_NAME = 'customer_id') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `customer_id` VARCHAR(36) DEFAULT NULL COMMENT ''CRM客户ID''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;


SELECT 'step-3: verify customer_id after patch' AS step;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COALESCE(CAST(COLUMN_DEFAULT AS CHAR), '') AS column_default,
  COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_production_order'
  AND COLUMN_NAME = 'customer_id';


SELECT 'cloud-db-production-order-customer-id-patch-20260316 finished' AS message;
