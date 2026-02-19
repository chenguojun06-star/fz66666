-- 修复样衣采购单缺少供应商的问题
-- 从款式BOM配置同步供应商信息到已生成的样衣采购单

USE fashion_supplychain;

-- 查看当前样衣采购单的供应商情况
SELECT
    COUNT(*) as total_sample_purchases,
    SUM(CASE WHEN supplier_name IS NULL OR supplier_name = '' THEN 1 ELSE 0 END) as missing_supplier
FROM material_purchase
WHERE source_type = 'sample';

-- 更新样衣采购单的供应商（从 BOM 配置同步）
UPDATE material_purchase mp
INNER JOIN t_style_bom bom ON
    mp.style_id = CAST(bom.style_id AS CHAR) AND
    mp.material_code = bom.material_code
SET mp.supplier_name = COALESCE(bom.supplier, '')
WHERE mp.source_type = 'sample'
  AND (mp.supplier_name IS NULL OR mp.supplier_name = '');

-- 验证修复结果
SELECT
    mp.purchase_no,
    mp.material_name,
    mp.supplier_name,
    bom.supplier as bom_supplier
FROM material_purchase mp
LEFT JOIN t_style_bom bom ON
    mp.style_id = CAST(bom.style_id AS CHAR) AND
    mp.material_code = bom.material_code
WHERE mp.source_type = 'sample'
LIMIT 10;

-- 查看哪些 BOM 配置缺少供应商
SELECT
    sb.style_id,
    si.style_no,
    si.style_name,
    sb.material_name,
    sb.supplier,
    sb.unit_price
FROM t_style_bom sb
LEFT JOIN t_style_info si ON sb.style_id = si.id
WHERE sb.supplier IS NULL OR sb.supplier = ''
ORDER BY sb.style_id;
