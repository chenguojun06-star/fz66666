-- D-256：存量物料资料库属性回填（幂等，可重复执行）
-- 背景：t_material_database 的 fabric_composition / fabric_weight / specifications
--       绝大多数为空（历史同步漏传），导致采购列表/弹窗查询时回填无米下锅、显示全空。
-- 口径：从 t_style_bom 按 (tenant_id, material_code) 聚合非空值回填，只填空值，不覆盖已有数据。
--       成分/克重/规格为物料固有属性，同编码跨款取值视为一致。
-- 执行方式：在生产库手动执行一次（Flyway 不管数据修复）。

UPDATE t_material_database db
JOIN (
    SELECT tenant_id, material_code,
           MAX(CASE WHEN fabric_composition IS NOT NULL AND fabric_composition <> '' THEN fabric_composition END) AS bom_composition,
           MAX(CASE WHEN fabric_weight IS NOT NULL AND fabric_weight <> '' THEN fabric_weight END) AS bom_weight,
           MAX(CASE WHEN specification IS NOT NULL AND specification <> '' THEN specification END) AS bom_spec
    FROM t_style_bom
    GROUP BY tenant_id, material_code
) b ON b.tenant_id = db.tenant_id AND b.material_code = db.material_code
SET db.fabric_composition = IF(db.fabric_composition IS NULL OR db.fabric_composition = '', b.bom_composition, db.fabric_composition),
    db.fabric_weight      = IF(db.fabric_weight IS NULL OR db.fabric_weight = '', b.bom_weight, db.fabric_weight),
    db.specifications     = IF(db.specifications IS NULL OR db.specifications = '', b.bom_spec, db.specifications)
WHERE db.fabric_composition IS NULL OR db.fabric_composition = ''
   OR db.fabric_weight IS NULL OR db.fabric_weight = ''
   OR db.specifications IS NULL OR db.specifications = '';
