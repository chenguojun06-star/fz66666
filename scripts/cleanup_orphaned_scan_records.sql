-- 清理孤立的扫码记录（对应的订单已删除）
-- 日期: 2026-01-25

-- 步骤1: 统计要删除的孤立扫码记录数量
SELECT COUNT(*) as orphaned_count
FROM t_scan_record tsr
WHERE NOT EXISTS (
    SELECT 1 FROM t_production_order tpo
    WHERE tpo.id = tsr.order_id
);

-- 步骤2: 列出要删除的孤立扫码记录（用于人工确认）
SELECT id, order_no, order_id, created_at, status
FROM t_scan_record tsr
WHERE NOT EXISTS (
    SELECT 1 FROM t_production_order tpo
    WHERE tpo.id = tsr.order_id
)
LIMIT 20;

-- 步骤3: 删除孤立的扫码记录（确认上面的结果后执行）
-- ⚠️ 请先执行上面的查询确认要删除的数据，再执行下面的DELETE
-- DELETE FROM t_scan_record tsr
-- WHERE NOT EXISTS (
--     SELECT 1 FROM t_production_order tpo
--     WHERE tpo.id = tsr.order_id
-- );
