-- 为测试订单 PO20260122001 添加面料采购单数据
-- 用于测试采购扫码功能

-- 插入面料采购单
INSERT INTO t_material_purchase (
    id,
    purchase_no,
    order_no,
    style_no,
    style_name,
    material_code,
    material_name,
    material_type,
    specifications,
    unit,
    purchase_quantity,
    arrived_quantity,
    supplier_name,
    unit_price,
    total_amount,
    status,
    create_time,
    update_time,
    delete_flag,
    return_confirmed,
    return_quantity
) VALUES
-- 面料1: 格子灰色面料
(
    'test-material-001',
    'MP20260124001',
    'PO20260124001',
    'ST001',
    '测试款式-格子衬衫',
    'MC001',
    '格子灰色面料',
    '主料',
    '宽150cm 克重120g/m²',
    '米',
    50,
    0,
    '杭州面料供应商',
    25.00,
    1250.00,
    'pending',
    NOW(),
    NOW(),
    0,
    0,
    0
),
-- 面料2: 领衬
(
    'test-material-002',
    'MP20260124001',
    'PO20260124001',
    'ST001',
    '测试款式-格子衬衫',
    'MC002',
    '领衬',
    '辅料',
    '宽100cm',
    '米',
    10,
    0,
    '杭州面料供应商',
    8.00,
    80.00,
    'pending',
    NOW(),
    NOW(),
    0,
    0,
    0
),
-- 面料3: 纽扣
(
    'test-material-003',
    'MP20260124001',
    'PO20260124001',
    'ST001',
    '测试款式-格子衬衫',
    'MC003',
    '纽扣',
    '辅料',
    '直径15mm 白色',
    '个',
    100,
    0,
    '义乌辅料市场',
    0.50,
    50.00,
    'pending',
    NOW(),
    NOW(),
    0,
    0,
    0
),
-- 面料4: 缝纫线
(
    'test-material-004',
    'MP20260124001',
    'PO20260124001',
    'ST001',
    '测试款式-格子衬衫',
    'MC004',
    '缝纫线',
    '辅料',
    '涤纶线 灰色',
    '卷',
    5,
    0,
    '义乌辅料市场',
    12.00,
    60.00,
    'pending',
    NOW(),
    NOW(),
    0,
    0,
    0
);

-- 验证插入结果
SELECT
    id,
    material_name,
    purchase_quantity,
    arrived_quantity,
    unit,
    specifications,
    status
FROM t_material_purchase
WHERE order_no = 'PO20260124001'
AND delete_flag = 0;
