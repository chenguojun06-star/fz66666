-- 修复测试订单PO20260122001的工序配置
-- 更新progress_workflow_json，添加5个详细的车缝工序

USE fashion_supplychain;

-- 1. 更新订单的progress_workflow_json字段
-- 包含7个主工序+5个车缝子工序
UPDATE t_production_order 
SET progress_workflow_json = JSON_OBJECT(
    'nodes', JSON_ARRAY(
        -- 主工序
        JSON_OBJECT('name', '采购', 'unitPrice', 0, 'id', 'purchase'),
        JSON_OBJECT('name', '裁剪', 'unitPrice', 0, 'id', 'cutting'),
        JSON_OBJECT('name', '车缝', 'unitPrice', 15, 'id', 'sewing'),
        JSON_OBJECT('name', '大烫', 'unitPrice', 0, 'id', 'pressing'),
        JSON_OBJECT('name', '质检', 'unitPrice', 0, 'id', 'quality'),
        JSON_OBJECT('name', '包装', 'unitPrice', 0, 'id', 'packaging'),
        JSON_OBJECT('name', '入库', 'unitPrice', 0, 'id', 'warehousing'),
        -- 车缝子工序（5个详细工序）
        JSON_OBJECT(
            'name', '做领',
            'progressStage', '车缝',
            'unitPrice', 2.50,
            'estimatedMinutes', 5,
            'sortOrder', 1
        ),
        JSON_OBJECT(
            'name', '上领',
            'progressStage', '车缝',
            'unitPrice', 1.80,
            'estimatedMinutes', 3,
            'sortOrder', 2
        ),
        JSON_OBJECT(
            'name', '埋夹',
            'progressStage', '车缝',
            'unitPrice', 2.00,
            'estimatedMinutes', 4,
            'sortOrder', 3
        ),
        JSON_OBJECT(
            'name', '冚脚边',
            'progressStage', '车缝',
            'unitPrice', 1.50,
            'estimatedMinutes', 3,
            'sortOrder', 4
        ),
        JSON_OBJECT(
            'name', '钉扣',
            'progressStage', '车缝',
            'unitPrice', 1.00,
            'estimatedMinutes', 2,
            'sortOrder', 5
        )
    )
)
WHERE order_no = 'PO20260122001';

-- 2. 验证更新结果
SELECT 
    order_no,
    JSON_LENGTH(progress_workflow_json->'$.nodes') as node_count,
    progress_workflow_json
FROM t_production_order 
WHERE order_no = 'PO20260122001'\G

-- 预期结果：node_count应该是12 (7个主工序 + 5个车缝子工序)

