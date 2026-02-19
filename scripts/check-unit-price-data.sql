-- 检查工序单价数据
-- 用法：在MySQL客户端执行或通过 mysql -u root -p fashion_supplychain < check-unit-price-data.sql

-- 1. 查看最近的订单及其工序配置
SELECT
    order_no AS '订单号',
    style_no AS '款号',
    order_name AS '订单名',
    CASE
        WHEN progress_workflow_json IS NULL THEN '❌ NULL'
        WHEN progress_workflow_json = '' THEN '❌ 空字符串'
        WHEN LENGTH(progress_workflow_json) < 50 THEN CONCAT('⚠️ 太短(', LENGTH(progress_workflow_json), '字节)')
        ELSE CONCAT('✅ 正常(', LENGTH(progress_workflow_json), '字节)')
    END AS 'JSON状态',
    LEFT(progress_workflow_json, 200) AS 'JSON前200字符'
FROM t_production_order
ORDER BY create_time DESC
LIMIT 5;

-- 2. 查看最近的扫码记录
SELECT
    sr.id AS 'ID',
    sr.order_no AS '订单号',
    sr.process_name AS '工序名',
    sr.unit_price AS '单价',
    sr.process_unit_price AS '工序单价',
    sr.quantity AS '数量',
    sr.scan_cost AS '扫码成本',
    sr.total_amount AS '总金额',
    sr.scan_time AS '扫码时间'
FROM t_scan_record sr
ORDER BY sr.scan_time DESC
LIMIT 10;

-- 3. 统计有无工序配置的订单
SELECT
    COUNT(*) AS '总订单数',
    SUM(CASE WHEN progress_workflow_json IS NOT NULL AND progress_workflow_json != '' THEN 1 ELSE 0 END) AS '有工序配置',
    SUM(CASE WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN 1 ELSE 0 END) AS '无工序配置'
FROM t_production_order;

-- 4. 查看特定订单的完整工序配置（需要替换订单号）
-- SELECT order_no, progress_workflow_json
-- FROM t_production_order
-- WHERE order_no = 'PO20260130003';
