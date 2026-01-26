-- =====================================================
-- 快速修复方案：直接更新测试订单 PO20260125003
-- =====================================================
-- 执行时间：< 1秒
-- 影响范围：仅当前测试订单
-- =====================================================

-- 方式1：保持1个车缝工序（最简单，建议旧订单使用）
UPDATE t_production_order
SET progress_workflow_json = '{
  "nodes": [
    {"name":"采购", "id":"purchase", "progressStage":"采购", "unitPrice":0},
    {"name":"裁剪", "id":"cutting", "progressStage":"裁剪", "unitPrice":0},
    {"name":"车缝", "id":"sewing", "progressStage":"车缝", "unitPrice":15},
    {"name":"大烫", "id":"pressing", "progressStage":"大烫", "unitPrice":0},
    {"name":"质检", "id":"quality", "progressStage":"质检", "unitPrice":0},
    {"name":"包装", "id":"packaging", "progressStage":"包装", "unitPrice":0},
    {"name":"入库", "id":"warehousing", "progressStage":"入库", "unitPrice":0}
  ]
}'
WHERE order_no = 'PO20260125003';

-- 方式2：展开为5个车缝工序（如需测试多工序扫码）
-- UPDATE t_production_order
-- SET progress_workflow_json = '{
--   "nodes": [
--     {"name":"采购", "id":"purchase", "progressStage":"采购", "unitPrice":0},
--     {"name":"裁剪", "id":"cutting", "progressStage":"裁剪", "unitPrice":0},
--     {"name":"做领", "id":"sewing1", "progressStage":"车缝", "unitPrice":3, "sortOrder":1},
--     {"name":"上领", "id":"sewing2", "progressStage":"车缝", "unitPrice":4, "sortOrder":2},
--     {"name":"肩缝", "id":"sewing3", "progressStage":"车缝", "unitPrice":2, "sortOrder":3},
--     {"name":"袖缝", "id":"sewing4", "progressStage":"车缝", "unitPrice":3, "sortOrder":4},
--     {"name":"侧缝", "id":"sewing5", "progressStage":"车缝", "unitPrice":2, "sortOrder":5},
--     {"name":"大烫", "id":"pressing", "progressStage":"大烫", "unitPrice":0},
--     {"name":"质检", "id":"quality", "progressStage":"质检", "unitPrice":0},
--     {"name":"包装", "id":"packaging", "progressStage":"包装", "unitPrice":0},
--     {"name":"入库", "id":"warehousing", "progressStage":"入库", "unitPrice":0}
--   ]
-- }'
-- WHERE order_no = 'PO20260125003';

-- 验证更新结果
SELECT
  order_no,
  progress_workflow_json
FROM t_production_order
WHERE order_no = 'PO20260125003';

-- 查看车缝节点详情
SELECT
  order_no,
  JSON_EXTRACT(progress_workflow_json, '$.nodes[2].name') as 工序名称,
  JSON_EXTRACT(progress_workflow_json, '$.nodes[2].progressStage') as 所属阶段,
  JSON_EXTRACT(progress_workflow_json, '$.nodes[2].unitPrice') as 单价
FROM t_production_order
WHERE order_no = 'PO20260125003';
