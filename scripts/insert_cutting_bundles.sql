-- 为订单 PO20260122001 插入裁剪菲号

-- 获取订单ID和款号ID
SET @order_id = (SELECT id FROM t_production_order WHERE order_no = 'PO20260122001' LIMIT 1);
SET @style_id = (SELECT style_id FROM t_production_order WHERE order_no = 'PO20260122001' LIMIT 1);

-- 先删除已有的裁剪记录（如果有）
DELETE FROM t_cutting_bundle WHERE production_order_no = 'PO20260122001';

-- 插入裁剪菲号（订单总数50件，分5个菲）
INSERT INTO t_cutting_bundle (id, production_order_id, production_order_no, style_id, style_no, color, size, quantity, bundle_no, qr_code, status, create_time, update_time)
VALUES 
(UUID(), @order_id, 'PO20260122001', @style_id, 'ST2026012200111', '格子灰色', 'S', 10, 1, 'PO20260122001-01', 'created', NOW(), NOW()),
(UUID(), @order_id, 'PO20260122001', @style_id, 'ST2026012200111', '格子灰色', 'M', 10, 2, 'PO20260122001-02', 'created', NOW(), NOW()),
(UUID(), @order_id, 'PO20260122001', @style_id, 'ST2026012200111', '格子灰色', 'L', 10, 3, 'PO20260122001-03', 'created', NOW(), NOW()),
(UUID(), @order_id, 'PO20260122001', @style_id, 'ST2026012200111', '格子灰色', 'XL', 10, 4, 'PO20260122001-04', 'created', NOW(), NOW()),
(UUID(), @order_id, 'PO20260122001', @style_id, 'ST2026012200111', '格子灰色', 'XXL', 10, 5, 'PO20260122001-05', 'created', NOW(), NOW());

-- 验证插入结果
SELECT '✅ 裁剪菲号插入成功' AS '状态';
SELECT bundle_no AS '菲号', color AS '颜色', size AS '尺码', quantity AS '数量', qr_code AS '二维码', status AS '状态'
FROM t_cutting_bundle 
WHERE production_order_no = 'PO20260122001'
ORDER BY bundle_no;
