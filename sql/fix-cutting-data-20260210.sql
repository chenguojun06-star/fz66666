-- ================================================================
-- 修复历史数据：裁剪扫码记录缺失单价 & 工序跟踪缺少裁剪节点
-- 日期：2026-02-10
-- 问题：CuttingTaskServiceImpl.completeBundling() 未设置 unit_price
-- ================================================================

-- 1. 修复有 progressWorkflowJson 的订单对应的裁剪扫码记录
-- 从订单的 workflow JSON 中提取裁剪相关单价并更新 t_scan_record
-- 注意：这里只能更新有 workflow 的订单（workflow 中前端设置好了工序单价）

-- 先查看需要修复的数据
SELECT sr.id, sr.order_no, sr.style_no, sr.quantity, sr.unit_price,
       po.progress_workflow_json IS NOT NULL as has_workflow
FROM t_scan_record sr
LEFT JOIN t_production_order po ON sr.order_id = po.id
WHERE sr.scan_type = 'cutting'
  AND sr.scan_result = 'success'
  AND (sr.unit_price IS NULL OR sr.unit_price = 0);

-- 2. 为现有工序跟踪表添加裁剪记录（每个菲号补一条裁剪记录）
-- 找出已有工序跟踪但没有裁剪记录的订单
SELECT DISTINCT ppt.production_order_id, ppt.production_order_no
FROM t_production_process_tracking ppt
WHERE NOT EXISTS (
    SELECT 1 FROM t_production_process_tracking ppt2
    WHERE ppt2.production_order_id = ppt.production_order_id
      AND ppt2.process_code = '裁剪'
);

-- 3. 为这些订单的每个菲号插入裁剪跟踪记录（状态为 scanned，因为裁剪已完成）
INSERT INTO t_production_process_tracking
  (id, production_order_id, production_order_no, cutting_bundle_id, bundle_no,
   sku, color, size, quantity, process_code, process_name, process_order,
   unit_price, scan_status, is_settled, creator)
SELECT
    REPLACE(UUID(), '-', '') as id,
    ppt.production_order_id,
    ppt.production_order_no,
    ppt.cutting_bundle_id,
    ppt.bundle_no,
    ppt.sku,
    ppt.color,
    ppt.size,
    ppt.quantity,
    '裁剪' as process_code,
    '裁剪' as process_name,
    0 as process_order,
    0.00 as unit_price,
    'scanned' as scan_status,
    0 as is_settled,
    'system' as creator
FROM (
    SELECT DISTINCT production_order_id, production_order_no,
           cutting_bundle_id, bundle_no, sku, color, size, quantity
    FROM t_production_process_tracking
) ppt
WHERE NOT EXISTS (
    SELECT 1 FROM t_production_process_tracking ppt2
    WHERE ppt2.production_order_id = ppt.production_order_id
      AND ppt2.cutting_bundle_id = ppt.cutting_bundle_id
      AND ppt2.process_code = '裁剪'
);

-- 4. 验证修复结果
SELECT production_order_no, process_code, COUNT(*) as cnt, scan_status
FROM t_production_process_tracking
WHERE process_code = '裁剪'
GROUP BY production_order_no, process_code, scan_status;

SELECT '修复完成' as status;
