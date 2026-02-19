-- 订单数据完整性检查脚本
-- 生成时间: 2026-02-15

-- 1. 检查最近10个订单的数据完整性
SELECT
    order_no AS '订单号',
    style_no AS '款号',
    merchandiser AS '跟单员',
    company AS '公司',
    product_category AS '品类',
    pattern_maker AS '纸样师',
    CASE
        WHEN order_details IS NULL OR order_details = '' THEN '❌ 缺失'
        ELSE CONCAT('✓ ', LEFT(order_details, 50), '...')
    END AS '订单明细',
    CASE
        WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN '❌ 缺失'
        ELSE '✓ 存在'
    END AS '工序流程',
    created_by_name AS '创建人',
    DATE_FORMAT(create_time, '%Y-%m-%d %H:%i') AS '创建时间'
FROM t_production_order
WHERE delete_flag = 0
ORDER BY create_time DESC
LIMIT 10;

-- 2. 统计缺失字段的订单数量
SELECT
    COUNT(*) AS '总订单数',
    SUM(CASE WHEN merchandiser IS NULL OR merchandiser = '' THEN 1 ELSE 0 END) AS '缺失跟单员',
    SUM(CASE WHEN company IS NULL OR company = '' THEN 1 ELSE 0 END) AS '缺失公司',
    SUM(CASE WHEN product_category IS NULL OR product_category = '' THEN 1 ELSE 0 END) AS '缺失品类',
    SUM(CASE WHEN pattern_maker IS NULL OR pattern_maker = '' THEN 1 ELSE 0 END) AS '缺失纸样师',
    SUM(CASE WHEN order_details IS NULL OR order_details = '' THEN 1 ELSE 0 END) AS '缺失订单明细',
    SUM(CASE WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN 1 ELSE 0 END) AS '缺失工序流程',
    SUM(CASE WHEN created_by_name IS NULL OR created_by_name = '' THEN 1 ELSE 0 END) AS '缺失创建人'
FROM t_production_order
WHERE delete_flag = 0;

-- 3. 按创建时间分组统计数据完整性（按月）
SELECT
    DATE_FORMAT(create_time, '%Y-%m') AS '月份',
    COUNT(*) AS '订单数',
    ROUND(AVG(CASE WHEN merchandiser IS NOT NULL AND merchandiser != '' THEN 1 ELSE 0 END) * 100, 1) AS '跟单员完整率%',
    ROUND(AVG(CASE WHEN company IS NOT NULL AND company != '' THEN 1 ELSE 0 END) * 100, 1) AS '公司完整率%',
    ROUND(AVG(CASE WHEN product_category IS NOT NULL AND product_category != '' THEN 1 ELSE 0 END) * 100, 1) AS '品类完整率%',
    ROUND(AVG(CASE WHEN pattern_maker IS NOT NULL AND pattern_maker != '' THEN 1 ELSE 0 END) * 100, 1) AS '纸样师完整率%',
    ROUND(AVG(CASE WHEN order_details IS NOT NULL AND order_details != '' THEN 1 ELSE 0 END) * 100, 1) AS '订单明细完整率%',
    ROUND(AVG(CASE WHEN progress_workflow_json IS NOT NULL AND progress_workflow_json != '' THEN 1 ELSE 0 END) * 100, 1) AS '工序流程完整率%'
FROM t_production_order
WHERE delete_flag = 0
GROUP BY DATE_FORMAT(create_time, '%Y-%m')
ORDER BY 月份 DESC;

-- 4. 查找问题订单（缺失关键字段）
SELECT
    order_no AS '订单号',
    style_no AS '款号',
    factory_name AS '工厂',
    CONCAT(
        CASE WHEN merchandiser IS NULL OR merchandiser = '' THEN '跟单员, ' ELSE '' END,
        CASE WHEN company IS NULL OR company = '' THEN '公司, ' ELSE '' END,
        CASE WHEN product_category IS NULL OR product_category = '' THEN '品类, ' ELSE '' END,
        CASE WHEN pattern_maker IS NULL OR pattern_maker = '' THEN '纸样师, ' ELSE '' END,
        CASE WHEN order_details IS NULL OR order_details = '' THEN '订单明细, ' ELSE '' END,
        CASE WHEN progress_workflow_json IS NULL OR progress_workflow_json = '' THEN '工序流程' ELSE '' END
    ) AS '缺失字段',
    created_by_name AS '创建人',
    DATE_FORMAT(create_time, '%Y-%m-%d %H:%i') AS '创建时间'
FROM t_production_order
WHERE delete_flag = 0
AND (
    merchandiser IS NULL OR merchandiser = ''
    OR company IS NULL OR company = ''
    OR product_category IS NULL OR product_category = ''
    OR pattern_maker IS NULL OR pattern_maker = ''
    OR order_details IS NULL OR order_details = ''
    OR progress_workflow_json IS NULL OR progress_workflow_json = ''
)
ORDER BY create_time DESC;

-- 5. 检查订单明细JSON格式是否正确
SELECT
    order_no,
    CASE
        WHEN order_details IS NULL THEN '❌ NULL'
        WHEN order_details = '' THEN '❌ 空字符串'
        WHEN order_details NOT LIKE '[%' THEN '❌ 非JSON数组'
        WHEN JSON_VALID(order_details) = 0 THEN '❌ 无效JSON'
        ELSE '✓ 格式正确'
    END AS '订单明细格式',
    CASE
        WHEN progress_workflow_json IS NULL THEN '❌ NULL'
        WHEN progress_workflow_json = '' THEN '❌ 空字符串'
        WHEN progress_workflow_json NOT LIKE '[%' THEN '❌ 非JSON数组'
        WHEN JSON_VALID(progress_workflow_json) = 0 THEN '❌ 无效JSON'
        ELSE '✓ 格式正确'
    END AS '工序流程格式'
FROM t_production_order
WHERE delete_flag = 0
ORDER BY create_time DESC
LIMIT 20;

-- 6. 验证采购需求是否关联了订单信息
SELECT
    p.order_no AS '订单号',
    COUNT(m.id) AS '采购需求数',
    SUM(CASE WHEN m.order_no IS NULL OR m.order_no = '' THEN 1 ELSE 0 END) AS '缺失订单号',
    SUM(CASE WHEN m.style_no IS NULL OR m.style_no = '' THEN 1 ELSE 0 END) AS '缺失款号',
    SUM(CASE WHEN m.style_name IS NULL OR m.style_name = '' THEN 1 ELSE 0 END) AS '缺失款名'
FROM t_production_order p
LEFT JOIN t_material_purchase m ON p.id = m.order_id AND m.delete_flag = 0
WHERE p.delete_flag = 0
GROUP BY p.order_no
HAVING COUNT(m.id) > 0
ORDER BY p.create_time DESC
LIMIT 10;

-- 7. 验证扫码记录是否关联了订单信息
SELECT
    p.order_no AS '订单号',
    COUNT(s.id) AS '扫码记录数',
    SUM(CASE WHEN s.order_no IS NULL OR s.order_no = '' THEN 1 ELSE 0 END) AS '缺失订单号',
    SUM(CASE WHEN s.style_no IS NULL OR s.style_no = '' THEN 1 ELSE 0 END) AS '缺失款号',
    SUM(CASE WHEN s.factory_name IS NULL OR s.factory_name = '' THEN 1 ELSE 0 END) AS '缺失工厂'
FROM t_production_order p
LEFT JOIN t_scan_record s ON p.id = s.order_id AND s.delete_flag = 0
WHERE p.delete_flag = 0
GROUP BY p.order_no
HAVING COUNT(s.id) > 0
ORDER BY p.create_time DESC
LIMIT 10;
