-- ============================================================
-- 云端手动执行 SQL - 补全 t_scan_record 缺失列
-- 执行位置：微信云托管控制台 → 数据库面板
-- 执行前查看：先执行末尾 SELECT 查询确认哪些列已存在
-- ============================================================
-- ⚠️ 如果某列已存在，ALTER TABLE ADD COLUMN 会报 "Duplicate column name" 错误
--    → 跳过该行继续执行下一条即可（幂等安全）

-- 1. scan_mode（扫码模式）
ALTER TABLE t_scan_record ADD COLUMN scan_mode VARCHAR(20) DEFAULT 'BUNDLE' COMMENT '扫码模式: ORDER/BUNDLE/SKU';

-- 2. sku_completed_count（SKU完成数）
ALTER TABLE t_scan_record ADD COLUMN sku_completed_count INT DEFAULT 0 COMMENT 'SKU完成数';

-- 3. sku_total_count（SKU总数）
ALTER TABLE t_scan_record ADD COLUMN sku_total_count INT DEFAULT 0 COMMENT 'SKU总数';

-- 4. process_unit_price（工序单价）
ALTER TABLE t_scan_record ADD COLUMN process_unit_price DECIMAL(15,2) DEFAULT NULL COMMENT '工序单价';

-- 5. scan_cost（扫码工序成本）
ALTER TABLE t_scan_record ADD COLUMN scan_cost DECIMAL(15,2) DEFAULT NULL COMMENT '扫码工序成本';

-- 6. actual_operator_id（实际操作员ID）
ALTER TABLE t_scan_record ADD COLUMN actual_operator_id VARCHAR(64) DEFAULT NULL COMMENT '实际操作员ID';

-- 7. actual_operator_name（实际操作员名称）
ALTER TABLE t_scan_record ADD COLUMN actual_operator_name VARCHAR(100) DEFAULT NULL COMMENT '实际操作员名称';

-- ============================================================
-- 验证（执行后查看结果确认7列全部存在）
-- ============================================================
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_scan_record'
  AND COLUMN_NAME IN ('scan_mode', 'sku_completed_count', 'sku_total_count',
                      'process_unit_price', 'scan_cost',
                      'actual_operator_id', 'actual_operator_name')
ORDER BY ORDINAL_POSITION;
