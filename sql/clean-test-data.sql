-- 测试数据清理脚本
-- 保留5条完整的业务流程数据：款式 → 订单 → 扫码 → 物料采购
-- 保留款式ID: 52, 62, 4, 35, 48

USE fashion_supplychain;

-- 开启事务
START TRANSACTION;

-- 1. 统计清理前数据量
SELECT '=== 清理前数据统计 ===' as '';
SELECT '款式' as table_name, COUNT(*) as total FROM t_style_info
UNION ALL SELECT '订单', COUNT(*) FROM t_production_order
UNION ALL SELECT '扫码记录', COUNT(*) FROM t_scan_record
UNION ALL SELECT '物料采购', COUNT(*) FROM t_material_purchase
UNION ALL SELECT 'BOM', COUNT(*) FROM t_style_bom
UNION ALL SELECT '工序', COUNT(*) FROM t_style_process
UNION ALL SELECT '操作日志', COUNT(*) FROM t_operation_log;

-- 2. 删除非保留款式的扫码记录（子表优先）
DELETE FROM t_scan_record
WHERE order_id NOT IN (
    SELECT id FROM t_production_order WHERE style_id IN ('52', '62', '4', '35', '48')
);

-- 3. 删除非保留款式的订单
DELETE FROM t_production_order
WHERE style_id NOT IN ('52', '62', '4', '35', '48');

-- 4. 删除非保留款式的物料采购（检查字段类型）
DELETE FROM t_material_purchase
WHERE CAST(style_id AS UNSIGNED) NOT IN (52, 62, 4, 35, 48);

-- 5. 删除非保留款式的BOM
DELETE FROM t_style_bom
WHERE style_id NOT IN (52, 62, 4, 35, 48);

-- 6. 删除非保留款式的工序
DELETE FROM t_style_process
WHERE style_id NOT IN (52, 62, 4, 35, 48);

-- 7. 删除非保留款式
DELETE FROM t_style_info
WHERE id NOT IN (52, 62, 4, 35, 48);

-- 8. 清理无关的操作日志（可选，保留最近100条）
DELETE FROM t_operation_log
WHERE id NOT IN (
    SELECT id FROM (
        SELECT id FROM t_operation_log
        ORDER BY operation_time DESC
        LIMIT 100
    ) as keep_logs
);

-- 9. 统计清理后数据量
SELECT '=== 清理后数据统计 ===' as '';
SELECT '款式' as table_name, COUNT(*) as total FROM t_style_info
UNION ALL SELECT '订单', COUNT(*) FROM t_production_order
UNION ALL SELECT '扫码记录', COUNT(*) FROM t_scan_record
UNION ALL SELECT '物料采购', COUNT(*) FROM t_material_purchase
UNION ALL SELECT 'BOM', COUNT(*) FROM t_style_bom
UNION ALL SELECT '工序', COUNT(*) FROM t_style_process
UNION ALL SELECT '操作日志', COUNT(*) FROM t_operation_log;

-- 10. 显示保留的款式信息
SELECT '=== 保留的款式数据 ===' as '';
SELECT
    s.id,
    s.style_no,
    s.style_name,
    COUNT(DISTINCT o.id) as order_count,
    COUNT(DISTINCT sr.id) as scan_count,
    COUNT(DISTINCT mp.id) as material_count,
    COUNT(DISTINCT sb.id) as bom_count
FROM t_style_info s
LEFT JOIN t_production_order o ON o.style_id = s.id
LEFT JOIN t_scan_record sr ON sr.order_id = o.id
LEFT JOIN t_material_purchase mp ON mp.style_id = s.id
LEFT JOIN t_style_bom sb ON sb.style_id = s.id
GROUP BY s.id
ORDER BY s.id;

-- 提交事务
COMMIT;

SELECT '=== 数据清理完成 ===' as '';
SELECT '保留5条完整业务流程：' as message;
SELECT '- ID 52 (HHY00322): 大规模测试数据' as '';
SELECT '- ID 62 (HYY20222): 中规模测试数据' as '';
SELECT '- ID 4 (ST2026012200111): 中规模测试数据' as '';
SELECT '- ID 35 (HYY20260100000): 中规模测试数据' as '';
SELECT '- ID 48 (HHY008): 小规模测试数据' as '';
