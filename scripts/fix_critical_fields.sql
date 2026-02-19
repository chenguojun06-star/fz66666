-- 数据库字段紧急修复脚本
-- 执行日期：2026-01-26
-- 目的：修复3个阻塞核心业务流程的字段问题

-- 问题1：修复 bundle_no 字段类型（int → varchar）
-- 影响：无法创建菲号，整个扫码流程阻塞
ALTER TABLE t_cutting_bundle MODIFY COLUMN bundle_no VARCHAR(100) NOT NULL;

-- 问题2：扫码表添加 bundle_no 字段（如果不存在）
-- 影响：菲号扫码模式无法使用
-- 先检查字段是否存在，不存在才添加
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_scan_record'
  AND COLUMN_NAME = 'bundle_no');

SET @sql = IF(@col_exists = 0,
  'ALTER TABLE t_scan_record ADD COLUMN bundle_no VARCHAR(100) AFTER cutting_bundle_qr_code',
  'SELECT "bundle_no字段已存在" as message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 问题3：修复 warehousing_no 允许NULL（后续通过代码生成）
-- 影响：质检入库无法创建
ALTER TABLE t_product_warehousing MODIFY COLUMN warehousing_no VARCHAR(50) NULL;

-- 验证修复结果
SELECT 'bundle_no字段类型' as 检查项, DATA_TYPE, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_cutting_bundle'
  AND COLUMN_NAME = 'bundle_no';

SELECT 'scan_record的bundle_no字段' as 检查项, COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_scan_record'
  AND COLUMN_NAME = 'bundle_no';

SELECT 'warehousing_no可空性' as 检查项, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME = 't_product_warehousing'
  AND COLUMN_NAME = 'warehousing_no';
