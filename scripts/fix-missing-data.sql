-- 修复样板生产记录的颜色和数量字段
-- 从对应的款式信息中同步数据

-- 1. 更新样板生产记录的颜色和数量（从 t_style_info 同步）
UPDATE t_pattern_production pp
INNER JOIN t_style_info si ON pp.style_id = si.id
SET
    pp.color = COALESCE(si.color, '-'),
    pp.quantity = COALESCE(si.sample_quantity, 1),
    pp.delivery_time = si.delivery_date,
    pp.update_time = NOW()
WHERE pp.delete_flag = 0
  AND (pp.color IS NULL OR pp.color = '' OR pp.color = '-'
       OR pp.quantity IS NULL OR pp.quantity = 0);

-- 2. 更新物料采购单的颜色和尺码（从 BOM 中提取第一个有效值）
UPDATE t_material_purchase mp
LEFT JOIN (
    SELECT
        sb.style_id,
        sb.material_code,
        sb.material_name,
        MAX(CASE WHEN sb.color IS NOT NULL AND sb.color != '' THEN sb.color ELSE NULL END) as first_color,
        MAX(CASE WHEN sb.size IS NOT NULL AND sb.size != '' THEN sb.size ELSE NULL END) as first_size
    FROM t_style_bom sb
    GROUP BY sb.style_id, sb.material_code, sb.material_name
) bom ON mp.style_id = bom.style_id
    AND mp.material_code = bom.material_code
    AND mp.material_name = bom.material_name
SET
    mp.color = COALESCE(bom.first_color, mp.color),
    mp.size = COALESCE(bom.first_size, mp.size),
    mp.update_time = NOW()
WHERE mp.delete_flag = 0
  AND (mp.color IS NULL OR mp.color = '' OR mp.size IS NULL OR mp.size = '');

-- 查看修复结果
SELECT 'Pattern Production Fixed:' as info, COUNT(*) as count
FROM t_pattern_production
WHERE delete_flag = 0 AND color IS NOT NULL AND quantity > 0;

SELECT 'Material Purchase Fixed:' as info, COUNT(*) as count
FROM t_material_purchase
WHERE delete_flag = 0 AND (color IS NOT NULL OR size IS NOT NULL);
