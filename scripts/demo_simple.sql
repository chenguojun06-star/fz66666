-- 演示订单：进度节点（父）→ 工序（子）关系
-- 订单号: PO20260129DEMO

DELETE FROM t_cutting_bundle WHERE production_order_no = 'PO20260129DEMO';
DELETE FROM t_production_order WHERE order_no = 'PO20260129DEMO';

INSERT INTO t_production_order (
    id, order_no, style_id, style_no, style_name,
    factory_id, factory_name, order_quantity,
    planned_end_date, order_details, status,
    create_time, update_time, delete_flag,
    material_arrival_rate, progress_workflow_json
) VALUES (
    'demo-order-20260129',
    'PO20260129DEMO',
    'demo-style-001',
    'ST001',
    '演示款式-格子衬衫',
    'demo-factory-001',
    '深圳制衣厂',
    500,
    DATE_ADD(NOW(), INTERVAL 45 DAY),
    '[{"color":"黑色","size":"S","quantity":50},{"color":"黑色","size":"M","quantity":100},{"color":"黑色","size":"L","quantity":80}]',
    'in_progress',
    NOW(),
    NOW(),
    0,
    100,
    '{
        "nodes": [
            {"id":"procurement-1","name":"采购面料","progressStage":"采购","unitPrice":0,"estimatedMinutes":0,"sortOrder":1},
            {"id":"procurement-2","name":"采购辅料","progressStage":"采购","unitPrice":0,"estimatedMinutes":0,"sortOrder":2},
            {"id":"cutting-1","name":"验布","progressStage":"裁剪","unitPrice":1.0,"estimatedMinutes":2,"sortOrder":3},
            {"id":"cutting-2","name":"裁剪","progressStage":"裁剪","unitPrice":3.0,"estimatedMinutes":5,"sortOrder":4},
            {"id":"sewing-1","name":"做领","progressStage":"车缝","unitPrice":2.5,"estimatedMinutes":5,"sortOrder":5,"description":"制作领子"},
            {"id":"sewing-2","name":"上领","progressStage":"车缝","unitPrice":1.8,"estimatedMinutes":3,"sortOrder":6,"description":"将领子缝到衣身"},
            {"id":"sewing-3","name":"埋夹","progressStage":"车缝","unitPrice":2.0,"estimatedMinutes":4,"sortOrder":7,"description":"缝制袖子夹缝"},
            {"id":"sewing-4","name":"冚脚边","progressStage":"车缝","unitPrice":1.5,"estimatedMinutes":3,"sortOrder":8,"description":"处理袖口和下摆"},
            {"id":"sewing-5","name":"钉扣","progressStage":"车缝","unitPrice":1.0,"estimatedMinutes":2,"sortOrder":9,"description":"缝制纽扣和扣眼"},
            {"id":"secondary-1","name":"打钮门","progressStage":"二次工艺","unitPrice":1.2,"estimatedMinutes":3,"sortOrder":10},
            {"id":"secondary-2","name":"绣花","progressStage":"二次工艺","unitPrice":3.0,"estimatedMinutes":8,"sortOrder":11},
            {"id":"tail-1","name":"大烫","progressStage":"尾部","unitPrice":2.0,"estimatedMinutes":4,"sortOrder":12},
            {"id":"tail-2","name":"质检","progressStage":"尾部","unitPrice":1.0,"estimatedMinutes":2,"sortOrder":13},
            {"id":"tail-3","name":"包装","progressStage":"尾部","unitPrice":1.0,"estimatedMinutes":2,"sortOrder":14}
        ]
    }'
);

INSERT INTO t_cutting_bundle (
    id, production_order_id, production_order_no, style_id, style_no,
    color, size, quantity, bundle_no, qr_code, status, create_time, update_time
) VALUES
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 1, 'PO20260129DEMO-黑色-01', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 2, 'PO20260129DEMO-黑色-02', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 3, 'PO20260129DEMO-黑色-03', 'created', NOW(), NOW());

SELECT '✅ 订单创建成功' AS '状态', 'PO20260129DEMO' AS '订单号';
