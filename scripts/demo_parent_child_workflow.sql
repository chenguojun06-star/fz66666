-- ========================================
-- 演示订单：进度节点（父）→ 工序（子）关系
-- ========================================
-- 订单号: PO20260129DEMO
-- 创建时间: 2026-01-29
-- 用途: 演示工艺模板的父子层级结构
-- ========================================

-- 清理旧数据（如果存在）
DELETE FROM t_cutting_bundle WHERE production_order_no = 'PO20260129DEMO';
DELETE FROM t_production_order WHERE order_no = 'PO20260129DEMO';

-- ========================================
-- 1. 创建测试订单
-- ========================================
INSERT INTO t_production_order (
    id,
    order_no,
    style_id,
    style_no,
    style_name,
    factory_id,
    factory_name,
    order_quantity,
    planned_end_date,
    order_details,
    status,
    create_time,
    update_time,
    delete_flag,
    material_arrival_rate,

    -- 🔑 关键字段：工艺模板JSON（包含完整的父子关系）
    progress_workflow_json
) VALUES (
    'demo-order-20260129',
    'PO20260129DEMO',
    'demo-style-001',
    'ST001',
    '演示款式-格子衬衫',
    'demo-factory-001',
    '深圳制衣厂',
    500,  -- 订单数量：500件
    DATE_ADD(NOW(), INTERVAL 45 DAY),

    -- SKU明细（款号+颜色+尺码）
    '[
        {"color":"黑色","size":"S","quantity":50},
        {"color":"黑色","size":"M","quantity":100},
        {"color":"黑色","size":"L","quantity":80},
        {"color":"白色","size":"S","quantity":40},
        {"color":"白色","size":"M","quantity":120},
        {"color":"白色","size":"L","quantity":110}
    ]',

    'in_progress',
    NOW(),
    NOW(),
    0,
    100,  -- 物料到位率：100%

    -- ========================================
    -- 🎯 工艺模板JSON - 完整的父子层级结构
    -- ========================================
    '{
        "nodes": [

            /* ==========================================
             * 📦 父节点1：采购（进度节点）
             * ========================================== */
            {
                "id": "procurement-1",
                "name": "采购面料",
                "progressStage": "采购",
                "unitPrice": 0,
                "estimatedMinutes": 0,
                "sortOrder": 1
            },
            {
                "id": "procurement-2",
                "name": "采购辅料",
                "progressStage": "采购",
                "unitPrice": 0,
                "estimatedMinutes": 0,
                "sortOrder": 2
            },
            {
                "id": "procurement-3",
                "name": "采购包材",
                "progressStage": "采购",
                "unitPrice": 0,
                "estimatedMinutes": 0,
                "sortOrder": 3
            },

            /* ==========================================
             * ✂️ 父节点2：裁剪（进度节点）
             * ========================================== */
            {
                "id": "cutting-1",
                "name": "验布",
                "progressStage": "裁剪",
                "unitPrice": 1.0,
                "estimatedMinutes": 2,
                "sortOrder": 4
            },
            {
                "id": "cutting-2",
                "name": "裁剪",
                "progressStage": "裁剪",
                "unitPrice": 3.0,
                "estimatedMinutes": 5,
                "sortOrder": 5
            },
            {
                "id": "cutting-3",
                "name": "打菲",
                "progressStage": "裁剪",
                "unitPrice": 0.5,
                "estimatedMinutes": 1,
                "sortOrder": 6
            },

            /* ==========================================
             * 🧵 父节点3：车缝（进度节点）← 你说的重点！
             * 说明：这个是你样衣开发填写的"车缝"
             *      下面的所有子工序都属于车缝环节
             * ========================================== */
            {
                "id": "sewing-1",
                "name": "做领",
                "progressStage": "车缝",
                "unitPrice": 2.5,
                "estimatedMinutes": 5,
                "sortOrder": 7,
                "description": "制作领子，包括缝制领面和领底"
            },
            {
                "id": "sewing-2",
                "name": "上领",
                "progressStage": "车缝",
                "unitPrice": 1.8,
                "estimatedMinutes": 3,
                "sortOrder": 8,
                "description": "将做好的领子缝到衣身上"
            },
            {
                "id": "sewing-3",
                "name": "埋夹",
                "progressStage": "车缝",
                "unitPrice": 2.0,
                "estimatedMinutes": 4,
                "sortOrder": 9,
                "description": "缝制袖子夹缝"
            },
            {
                "id": "sewing-4",
                "name": "冚脚边",
                "progressStage": "车缝",
                "unitPrice": 1.5,
                "estimatedMinutes": 3,
                "sortOrder": 10,
                "description": "处理袖口和下摆边缘"
            },
            {
                "id": "sewing-5",
                "name": "钉扣",
                "progressStage": "车缝",
                "unitPrice": 1.0,
                "estimatedMinutes": 2,
                "sortOrder": 11,
                "description": "缝制纽扣和扣眼"
            },

            /* ==========================================
             * 🔧 父节点4：二次工艺（进度节点）
             * ========================================== */
            {
                "id": "secondary-1",
                "name": "打钮门",
                "progressStage": "二次工艺",
                "unitPrice": 1.2,
                "estimatedMinutes": 3,
                "sortOrder": 12
            },
            {
                "id": "secondary-2",
                "name": "打钉",
                "progressStage": "二次工艺",
                "unitPrice": 0.8,
                "estimatedMinutes": 2,
                "sortOrder": 13
            },
            {
                "id": "secondary-3",
                "name": "绣花",
                "progressStage": "二次工艺",
                "unitPrice": 3.0,
                "estimatedMinutes": 8,
                "sortOrder": 14,
                "description": "领口或袖口绣花装饰"
            },

            /* ==========================================
             * 🎀 父节点5：尾部（进度节点）
             * ========================================== */
            {
                "id": "tail-1",
                "name": "大烫",
                "progressStage": "尾部",
                "unitPrice": 2.0,
                "estimatedMinutes": 4,
                "sortOrder": 15
            },
            {
                "id": "tail-2",
                "name": "剪线头",
                "progressStage": "尾部",
                "unitPrice": 0.5,
                "estimatedMinutes": 1,
                "sortOrder": 16
            },
            {
                "id": "tail-3",
                "name": "质检",
                "progressStage": "尾部",
                "unitPrice": 1.0,
                "estimatedMinutes": 2,
                "sortOrder": 17
            },
            {
                "id": "tail-4",
                "name": "包装",
                "progressStage": "尾部",
                "unitPrice": 1.0,
                "estimatedMinutes": 2,
                "sortOrder": 18
            }
        ]
    }'
);

-- ========================================
-- 2. 创建裁剪菲号（用于扫码测试）
-- ========================================
-- 黑色-M: 100件，分成10个菲号（每菲10件）
INSERT INTO t_cutting_bundle (
    id, production_order_id, production_order_no,
    style_id, style_no, color, size, quantity,
    bundle_no, qr_code, status,
    create_time, update_time
) VALUES
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 1, 'PO20260129DEMO-黑色-01', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 2, 'PO20260129DEMO-黑色-02', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 3, 'PO20260129DEMO-黑色-03', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 4, 'PO20260129DEMO-黑色-04', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 5, 'PO20260129DEMO-黑色-05', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 6, 'PO20260129DEMO-黑色-06', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 7, 'PO20260129DEMO-黑色-07', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 8, 'PO20260129DEMO-黑色-08', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 9, 'PO20260129DEMO-黑色-09', 'created', NOW(), NOW()),
    (UUID(), 'demo-order-20260129', 'PO20260129DEMO', 'demo-style-001', 'ST001', '黑色', 'M', 10, 10, 'PO20260129DEMO-黑色-10', 'created', NOW(), NOW());

-- ========================================
-- 3. 验证数据
-- ========================================

-- 查看订单基本信息
SELECT
    order_no AS '订单号',
    style_name AS '款式',
    order_quantity AS '订单数量',
    factory_name AS '加工厂',
    material_arrival_rate AS '物料到位率'
FROM t_production_order
WHERE order_no = 'PO20260129DEMO';

-- 查看工艺模板层级结构（父子关系）
SELECT
    JSON_UNQUOTE(JSON_EXTRACT(node, '$.progressStage')) AS '父节点（进度节点）',
    JSON_UNQUOTE(JSON_EXTRACT(node, '$.name')) AS '子节点（工序名称）',
    JSON_UNQUOTE(JSON_EXTRACT(node, '$.unitPrice')) AS '单价（元）',
    JSON_UNQUOTE(JSON_EXTRACT(node, '$.estimatedMinutes')) AS '预计时间（分/件）',
    JSON_UNQUOTE(JSON_EXTRACT(node, '$.sortOrder')) AS '排序'
FROM t_production_order,
     JSON_TABLE(
         progress_workflow_json,
         '$.nodes[*]' COLUMNS (
             node JSON PATH '$'
         )
     ) AS jt
WHERE order_no = 'PO20260129DEMO'
ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(node, '$.sortOrder')) AS UNSIGNED);

-- 查看车缝阶段的所有工序（演示父节点筛选子节点）
SELECT
    '🧵 车缝' AS '父节点',
    JSON_UNQUOTE(JSON_EXTRACT(node, '$.name')) AS '子工序',
    CONCAT(JSON_UNQUOTE(JSON_EXTRACT(node, '$.unitPrice')), ' 元') AS '单价',
    CONCAT(JSON_UNQUOTE(JSON_EXTRACT(node, '$.estimatedMinutes')), ' 分钟') AS '预计时间',
    JSON_UNQUOTE(JSON_EXTRACT(node, '$.description')) AS '说明'
FROM t_production_order,
     JSON_TABLE(
         progress_workflow_json,
         '$.nodes[*]' COLUMNS (
             node JSON PATH '$'
         )
     ) AS jt
WHERE order_no = 'PO20260129DEMO'
  AND JSON_UNQUOTE(JSON_EXTRACT(node, '$.progressStage')) = '车缝'
ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(node, '$.sortOrder')) AS UNSIGNED);

-- 查看裁剪菲号
SELECT
    bundle_no AS '菲号',
    qr_code AS '二维码内容',
    CONCAT(color, '-', size) AS '颜色尺码',
    quantity AS '数量',
    status AS '状态'
FROM t_cutting_bundle
WHERE production_order_no = 'PO20260129DEMO'
ORDER BY bundle_no;

-- ========================================
-- 4. 父子关系汇总报表
-- ========================================
SELECT
    parent.progressStage AS '父节点（进度节点）',
    COUNT(child.name) AS '子工序数量',
    SUM(CAST(child.unitPrice AS DECIMAL(10,2))) AS '单价总和',
    GROUP_CONCAT(child.name ORDER BY child.sortOrder SEPARATOR ' → ') AS '工序流程'
FROM (
    SELECT DISTINCT
        JSON_UNQUOTE(JSON_EXTRACT(node, '$.progressStage')) AS progressStage
    FROM t_production_order,
         JSON_TABLE(
             progress_workflow_json,
             '$.nodes[*]' COLUMNS (node JSON PATH '$')
         ) AS jt
    WHERE order_no = 'PO20260129DEMO'
) AS parent
LEFT JOIN (
    SELECT
        JSON_UNQUOTE(JSON_EXTRACT(node, '$.progressStage')) AS progressStage,
        JSON_UNQUOTE(JSON_EXTRACT(node, '$.name')) AS name,
        JSON_UNQUOTE(JSON_EXTRACT(node, '$.unitPrice')) AS unitPrice,
        JSON_UNQUOTE(JSON_EXTRACT(node, '$.sortOrder')) AS sortOrder
    FROM t_production_order,
         JSON_TABLE(
             progress_workflow_json,
             '$.nodes[*]' COLUMNS (node JSON PATH '$')
         ) AS jt
    WHERE order_no = 'PO20260129DEMO'
) AS child ON parent.progressStage = child.progressStage
GROUP BY parent.progressStage
ORDER BY MIN(CAST(child.sortOrder AS UNSIGNED));

-- ========================================
-- 执行完毕提示
-- ========================================
SELECT '✅ 演示订单创建成功！订单号: PO20260129DEMO' AS '状态';
SELECT '📊 请查看上方4个查询结果，了解父子关系结构' AS '提示';
