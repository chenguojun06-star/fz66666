-- 快速创建测试订单 PO20260122001（简化版）

-- 1. 获取或创建款号
SET @style_id = (SELECT id FROM t_style_info WHERE style_no = 'ST001' LIMIT 1);

-- 如果没有款号，创建一个
INSERT INTO t_style_info (style_no, style_name, category, season, status, create_time, update_time)
SELECT 'ST001', '测试款式-白色衬衫', '衬衫', '2026春季', 'ENABLED', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_style_info WHERE style_no = 'ST001');

SET @style_id = (SELECT id FROM t_style_info WHERE style_no = 'ST001' LIMIT 1);

-- 2. 获取或创建工厂
SET @factory_id = (SELECT id FROM t_factory WHERE factory_name = '测试工厂' LIMIT 1);

INSERT INTO t_factory (id, factory_name, factory_code, contact_person, contact_phone, address, status, create_time, update_time)
SELECT UUID(), '测试工厂', 'TEST_FACTORY', '张三', '13800138000', '测试地址', 'active', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_factory WHERE factory_name = '测试工厂');

SET @factory_id = (SELECT id FROM t_factory WHERE factory_name = '测试工厂' LIMIT 1);

-- 3. 创建生产订单（如果不存在）
INSERT INTO t_production_order (
    id,
    order_no,
    style_id,
    style_no,
    style_name,
    factory_id,
    factory_name,
    order_quantity,
    completed_quantity,
    material_arrival_rate,
    production_progress,
    status,
    planned_end_date,
    order_details,
    delete_flag,
    create_time,
    update_time
)
SELECT 
    UUID(),
    'PO20260122001',
    @style_id,
    'ST001',
    '测试款式-白色衬衫',
    @factory_id,
    '测试工厂',
    100,
    0,
    100,
    10,
    'in_progress',
    DATE_ADD(NOW(), INTERVAL 30 DAY),
    '[{"color":"红色","size":"M","quantity":20},{"color":"红色","size":"L","quantity":15},{"color":"蓝色","size":"M","quantity":25},{"color":"蓝色","size":"L","quantity":20},{"color":"白色","size":"M","quantity":10},{"color":"白色","size":"L","quantity":10}]',
    0,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_production_order WHERE order_no = 'PO20260122001');

-- 4. 获取订单ID
SET @order_id = (SELECT id FROM t_production_order WHERE order_no = 'PO20260122001' LIMIT 1);

-- 5. 创建裁剪菲号（如果不存在）
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
)
SELECT UUID(), @order_id, 'PO20260122001', @style_id, 'ST001', '红色', 'M', 20, 1, 'PO20260122001-ST001-红色-M-20-1', 'created', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_cutting_bundle WHERE production_order_no = 'PO20260122001' AND bundle_no = 1)
UNION ALL
SELECT UUID(), @order_id, 'PO20260122001', @style_id, 'ST001', '红色', 'L', 15, 2, 'PO20260122001-ST001-红色-L-15-2', 'created', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_cutting_bundle WHERE production_order_no = 'PO20260122001' AND bundle_no = 2)
UNION ALL
SELECT UUID(), @order_id, 'PO20260122001', @style_id, 'ST001', '蓝色', 'M', 25, 3, 'PO20260122001-ST001-蓝色-M-25-3', 'created', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_cutting_bundle WHERE production_order_no = 'PO20260122001' AND bundle_no = 3)
UNION ALL
SELECT UUID(), @order_id, 'PO20260122001', @style_id, 'ST001', '蓝色', 'L', 20, 4, 'PO20260122001-ST001-蓝色-L-20-4', 'created', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_cutting_bundle WHERE production_order_no = 'PO20260122001' AND bundle_no = 4)
UNION ALL
SELECT UUID(), @order_id, 'PO20260122001', @style_id, 'ST001', '白色', 'M', 10, 5, 'PO20260122001-ST001-白色-M-10-5', 'created', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_cutting_bundle WHERE production_order_no = 'PO20260122001' AND bundle_no = 5)
UNION ALL
SELECT UUID(), @order_id, 'PO20260122001', @style_id, 'ST001', '白色', 'L', 10, 6, 'PO20260122001-ST001-白色-L-10-6', 'created', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_cutting_bundle WHERE production_order_no = 'PO20260122001' AND bundle_no = 6);

-- 验证数据
SELECT '✅ 订单创建成功' AS '状态';
SELECT order_no AS '订单号', style_no AS '款号', order_quantity AS '数量', status AS '状态'
FROM t_production_order 
WHERE order_no = 'PO20260122001';

SELECT '✅ 裁剪菲号创建成功' AS '状态';
SELECT bundle_no AS '菲号', CONCAT(color, size) AS '颜色尺码', quantity AS '数量', qr_code AS '二维码'
FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001'
ORDER BY bundle_no;

-- 打印测试二维码
SELECT '📱 测试二维码（复制任一行扫描测试）' AS '提示';
SELECT CONCAT('菲号', LPAD(bundle_no, 2, '0'), ': ', qr_code) AS '二维码内容'
FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001'
ORDER BY bundle_no;
