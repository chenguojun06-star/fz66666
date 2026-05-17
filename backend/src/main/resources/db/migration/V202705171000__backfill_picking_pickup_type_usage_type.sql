-- ============================================================
-- 回填 t_material_picking 的 pickup_type 和 usage_type
-- 历史 PICK- 记录因旧代码未设置这两个字段，导致 NULL
-- ============================================================

-- 1. 回填 pickup_type：按关联生产订单的 factory_type
UPDATE t_material_picking mp
JOIN t_production_order po ON po.id = mp.order_id AND po.delete_flag = 0
SET mp.pickup_type = CASE
    WHEN po.factory_type = 'EXTERNAL' THEN 'EXTERNAL'
    ELSE 'INTERNAL'
END
WHERE mp.picking_no LIKE 'PICK-%'
  AND mp.delete_flag = 0
  AND mp.pickup_type IS NULL;

-- 2. 回填 usage_type：按关联采购单的 source_type
-- purchaseId 存储在 remark 中：WAREHOUSE_PICK|purchaseId=xxx
UPDATE t_material_picking mp
JOIN t_material_purchase pur ON pur.id = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(mp.remark, 'purchaseId=', -1), '|', 1))
  AND pur.delete_flag = 0
SET mp.usage_type = CASE
    WHEN pur.source_type = 'sample' THEN 'SAMPLE'
    WHEN pur.source_type = 'stock'  THEN 'STOCK'
    ELSE 'BULK'
END
WHERE mp.picking_no LIKE 'PICK-%'
  AND mp.delete_flag = 0
  AND mp.usage_type IS NULL
  AND mp.remark LIKE '%purchaseId=%';

-- 3. 兜底：remark 中没有 purchaseId 的 PICK 记录，默认 BULK
UPDATE t_material_picking
SET usage_type = 'BULK'
WHERE picking_no LIKE 'PICK-%'
  AND delete_flag = 0
  AND usage_type IS NULL;

-- 4. 回填 MPK 记录的 pickup_type（BOM 领取默认为内部）
UPDATE t_material_picking
SET pickup_type = 'INTERNAL'
WHERE picking_no LIKE 'MPK%'
  AND delete_flag = 0
  AND pickup_type IS NULL;

-- 5. MPK 记录 usage_type 兜底为 SAMPLE（BOM 领料默认样衣用料）
UPDATE t_material_picking
SET usage_type = 'SAMPLE'
WHERE picking_no LIKE 'MPK%'
  AND delete_flag = 0
  AND usage_type IS NULL;