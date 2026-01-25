-- 修复孤儿采购记录：软删除关联已删除订单的采购记录
-- 作者：系统维护
-- 日期：2026-01-25
-- 用途：清理因订单删除导致的孤儿采购记录

-- 1. 检查有多少采购记录关联的订单已删除
SELECT
    COUNT(*) AS orphaned_purchase_count,
    GROUP_CONCAT(DISTINCT mp.order_no SEPARATOR ', ') AS deleted_order_nos
FROM t_material_purchase mp
LEFT JOIN t_production_order po ON mp.order_id = po.id
WHERE mp.delete_flag = 0
  AND (po.id IS NULL OR po.delete_flag = 1);

-- 2. 列出具体的孤儿采购记录（仅显示前20条）
SELECT
    mp.id,
    mp.purchase_no,
    mp.order_id,
    mp.order_no,
    mp.material_name,
    mp.delete_flag AS purchase_delete_flag,
    po.id AS order_exists,
    po.delete_flag AS order_delete_flag,
    mp.create_time
FROM t_material_purchase mp
LEFT JOIN t_production_order po ON mp.order_id = po.id
WHERE mp.delete_flag = 0
  AND (po.id IS NULL OR po.delete_flag = 1)
ORDER BY mp.create_time DESC
LIMIT 20;

-- 3. 修复：软删除这些孤儿采购记录
-- ⚠️ 请先运行上面的查询确认数据后再执行此语句
UPDATE t_material_purchase mp
LEFT JOIN t_production_order po ON mp.order_id = po.id
SET
    mp.delete_flag = 1,
    mp.update_time = NOW()
WHERE mp.delete_flag = 0
  AND (po.id IS NULL OR po.delete_flag = 1);

-- 4. 验证修复结果
SELECT COUNT(*) AS remaining_orphaned_purchases
FROM t_material_purchase mp
LEFT JOIN t_production_order po ON mp.order_id = po.id
WHERE mp.delete_flag = 0
  AND (po.id IS NULL OR po.delete_flag = 1);
