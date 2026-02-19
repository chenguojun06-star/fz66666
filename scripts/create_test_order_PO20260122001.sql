-- 创建测试订单数据
-- 订单号: PO20260122001
-- 用于裁剪码扫描测试

-- 1. 插入测试款号（如果不存在）
INSERT INTO t_style_info (
    style_no, 
    style_name, 
    season, 
    category, 
    create_time, 
    update_time
) VALUES (
    'ST001',
    '测试款式-白色衬衫',
    '2026春季',
    '衬衫',
    NOW(),
    NOW()
) ON DUPLICATE KEY UPDATE style_no = style_no;

-- 2. 插入测试生产订单
INSERT INTO t_production_order (
    id,
    order_no,
    style_id,
    style_no,
    style_name,
    order_quantity,
    customer_name,
    delivery_date,
    order_details,
    status,
    create_time,
    update_time,
    delete_flag,
    current_process_name,
    material_arrival_rate
) VALUES (
    'test-order-001',
    'PO20260122001',
    'test-style-001',
    'ST001',
    '测试款式-白色衬衫',
    100,
    '测试客户',
    DATE_ADD(NOW(), INTERVAL 30 DAY),
    '[{"color":"红色","size":"M","quantity":20},{"color":"红色","size":"L","quantity":15},{"color":"蓝色","size":"M","quantity":25},{"color":"蓝色","size":"L","quantity":20},{"color":"白色","size":"M","quantity":10},{"color":"白色","size":"L","quantity":10}]',
    'in_progress',
    NOW(),
    NOW(),
    0,
    '裁剪',
    100
) ON DUPLICATE KEY UPDATE order_no = order_no;

-- 3. 创建工艺模板（如果不存在）
INSERT INTO t_progress_template (
    id,
    template_name,
    status,
    create_time,
    update_time
) VALUES (
    'test-template-001',
    '测试工艺模板',
    'active',
    NOW(),
    NOW()
) ON DUPLICATE KEY UPDATE template_name = template_name;

-- 4. 添加工艺节点单价（车缝工序）
INSERT INTO t_progress_node_unit_price (
    id,
    template_id,
    progress_stage,
    name,
    unit_price,
    estimated_minutes,
    sort_order,
    create_time,
    update_time
) VALUES 
(
    'test-node-001',
    'test-template-001',
    '车缝',
    '做领',
    2.50,
    5,
    1,
    NOW(),
    NOW()
),
(
    'test-node-002',
    'test-template-001',
    '车缝',
    '上领',
    1.80,
    3,
    2,
    NOW(),
    NOW()
),
(
    'test-node-003',
    'test-template-001',
    '车缝',
    '埋夹',
    2.00,
    4,
    3,
    NOW(),
    NOW()
),
(
    'test-node-004',
    'test-template-001',
    '车缝',
    '冚脚边',
    1.50,
    3,
    4,
    NOW(),
    NOW()
),
(
    'test-node-005',
    'test-template-001',
    '车缝',
    '钉扣',
    1.00,
    2,
    5,
    NOW(),
    NOW()
)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 5. 关联订单与工艺模板
UPDATE t_production_order 
SET progress_node_unit_prices = (
    SELECT CONCAT('[',
        GROUP_CONCAT(
            JSON_OBJECT(
                'progressStage', progress_stage,
                'name', name,
                'unitPrice', unit_price,
                'estimatedMinutes', estimated_minutes,
                'sortOrder', sort_order
            )
        ),
    ']')
    FROM t_progress_node_unit_price
    WHERE template_id = 'test-template-001'
)
WHERE order_no = 'PO20260122001';

-- 6. 生成裁剪菲号（示例：6个菲号对应6个颜色尺码组合）
INSERT INTO t_cutting_bundle (
    id,
    production_order_id,
    production_order_no,
    style_id,
    style_no,
    color,
    size,
    quantity,
    bundle_no,
    qr_code,
    status,
    create_time,
    update_time
) VALUES
(
    UUID(),
    'test-order-001',
    'PO20260122001',
    'test-style-001',
    'ST001',
    '红色',
    'M',
    20,
    1,
    'PO20260122001-ST001-红色-M-20-1',
    'created',
    NOW(),
    NOW()
),
(
    UUID(),
    'test-order-001',
    'PO20260122001',
    'test-style-001',
    'ST001',
    '红色',
    'L',
    15,
    2,
    'PO20260122001-ST001-红色-L-15-2',
    'created',
    NOW(),
    NOW()
),
(
    UUID(),
    'test-order-001',
    'PO20260122001',
    'test-style-001',
    'ST001',
    '蓝色',
    'M',
    25,
    3,
    'PO20260122001-ST001-蓝色-M-25-3',
    'created',
    NOW(),
    NOW()
),
(
    UUID(),
    'test-order-001',
    'PO20260122001',
    'test-style-001',
    'ST001',
    '蓝色',
    'L',
    20,
    4,
    'PO20260122001-ST001-蓝色-L-20-4',
    'created',
    NOW(),
    NOW()
),
(
    UUID(),
    'test-order-001',
    'PO20260122001',
    'test-style-001',
    'ST001',
    '白色',
    'M',
    10,
    5,
    'PO20260122001-ST001-白色-M-10-5',
    'created',
    NOW(),
    NOW()
),
(
    UUID(),
    'test-order-001',
    'PO20260122001',
    'test-style-001',
    'ST001',
    '白色',
    'L',
    10,
    6,
    'PO20260122001-ST001-白色-L-10-6',
    'created',
    NOW(),
    NOW()
)
ON DUPLICATE KEY UPDATE qr_code = VALUES(qr_code);

-- 验证数据
SELECT '=== 订单信息 ===' AS info;
SELECT 
    order_no AS '订单号',
    style_no AS '款号',
    style_name AS '款名',
    order_quantity AS '订单数量',
    current_process_name AS '当前进度',
    status AS '状态'
FROM t_production_order 
WHERE order_no = 'PO20260122001';

SELECT '=== 裁剪菲号 ===' AS info;
SELECT 
    bundle_no AS '菲号',
    color AS '颜色',
    size AS '尺码',
    quantity AS '数量',
    qr_code AS '二维码内容',
    status AS '状态'
FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001'
ORDER BY bundle_no;

SELECT '=== 工艺节点 ===' AS info;
SELECT 
    progress_stage AS '进度阶段',
    name AS '工序名称',
    unit_price AS '单价',
    estimated_minutes AS '预计时间(分钟)',
    sort_order AS '排序'
FROM t_progress_node_unit_price
WHERE template_id = 'test-template-001'
ORDER BY sort_order;

-- 测试用二维码内容
SELECT '=== 测试用二维码 ===' AS info;
SELECT CONCAT(
    '菲号', LPAD(bundle_no, 2, '0'), ': ',
    qr_code
) AS '扫描此内容'
FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001'
ORDER BY bundle_no;
