-- ============================================================
-- 回填 t_material_outbound_log 的 outbound_no 和 picking_no
-- 旧版 recordOutboundLog 未设置这两个字段
-- ============================================================

-- 通过 remark 中的 pickingNo= 回填 picking_no 和 outbound_no
UPDATE t_material_outbound_log ol
SET ol.picking_no = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(ol.remark, 'pickingNo=', -1), '|', 1)),
    ol.outbound_no = TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(ol.remark, 'pickingNo=', -1), '|', 1))
WHERE ol.remark LIKE '%pickingNo=%'
  AND ol.picking_no IS NULL;