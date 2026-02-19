-- =====================================================
-- 修复订单工序配置：为车缝节点添加 progressStage 字段
-- =====================================================
-- 目的：修复旧版本订单的 progress_workflow_json 配置
-- 问题：旧订单只有 {"name":"车缝"} 没有 progressStage 字段
-- 解决：为所有节点添加 progressStage 字段，使扫码逻辑能正确识别
-- =====================================================

-- 注意：此脚本为所有订单的工序节点添加 progressStage 字段
-- 执行前请备份数据库！

-- 更新所有生产订单的工序配置
UPDATE t_production_order
SET progress_workflow_json = JSON_SET(
  -- 基础结构
  COALESCE(progress_workflow_json, '{"nodes":[]}'),

  -- 为每个节点添加 progressStage 字段（与 name 相同）
  '$.nodes[0].progressStage', JSON_EXTRACT(COALESCE(progress_workflow_json, '{"nodes":[{"name":"采购"}]}'), '$.nodes[0].name'),
  '$.nodes[1].progressStage', JSON_EXTRACT(COALESCE(progress_workflow_json, '{"nodes":[{},{},{"name":"裁剪"}]}'), '$.nodes[1].name'),
  '$.nodes[2].progressStage', '车缝',  -- 第3个节点固定为车缝阶段
  '$.nodes[3].progressStage', JSON_EXTRACT(COALESCE(progress_workflow_json, '{"nodes":[{},{},{},{"name":"大烫"}]}'), '$.nodes[3].name'),
  '$.nodes[4].progressStage', JSON_EXTRACT(COALESCE(progress_workflow_json, '{"nodes":[{},{},{},{},{"name":"质检"}]}'), '$.nodes[4].name'),
  '$.nodes[5].progressStage', JSON_EXTRACT(COALESCE(progress_workflow_json, '{"nodes":[{},{},{},{},{},{"name":"包装"}]}'), '$.nodes[5].name'),
  '$.nodes[6].progressStage', JSON_EXTRACT(COALESCE(progress_workflow_json, '{"nodes":[{},{},{},{},{},{},{"name":"入库"}]}'), '$.nodes[6].name')
)
WHERE progress_workflow_json IS NOT NULL
  AND JSON_VALID(progress_workflow_json)
  AND delete_flag = 0;

-- 查看更新结果（示例订单）
SELECT
  order_no,
  JSON_EXTRACT(progress_workflow_json, '$.nodes[2].name') as 车缝节点名称,
  JSON_EXTRACT(progress_workflow_json, '$.nodes[2].progressStage') as 车缝阶段标识,
  progress_workflow_json
FROM t_production_order
WHERE order_no = 'PO20260125003'
LIMIT 1;

-- 统计有多少订单被更新
SELECT
  COUNT(*) as total_orders,
  SUM(CASE WHEN JSON_EXTRACT(progress_workflow_json, '$.nodes[2].progressStage') IS NOT NULL THEN 1 ELSE 0 END) as has_progressStage,
  SUM(CASE WHEN JSON_EXTRACT(progress_workflow_json, '$.nodes[2].progressStage') IS NULL THEN 1 ELSE 0 END) as no_progressStage
FROM t_production_order
WHERE progress_workflow_json IS NOT NULL
  AND delete_flag = 0;
