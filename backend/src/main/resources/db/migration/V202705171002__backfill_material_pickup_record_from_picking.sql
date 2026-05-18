-- ============================================================
-- 对已完成的 PICK 领料记录补建 t_material_pickup_record
-- 旧版 confirmPickingOutbound 未调用 syncPickupRecordAfterOutbound
-- 导致审核→应收→收款链路断裂
-- ============================================================
-- 注意：仅使用建表(V202607191700)时存在的基础列
-- movement_type/source_type/fabric_width 等列由 DbColumnRepairRunner 后续补上
-- ============================================================

INSERT INTO t_material_pickup_record (
    id, tenant_id, pickup_no, pickup_type,
    order_no, style_no,
    material_id, material_code, material_name, material_type,
    color, specification,
    quantity, unit, unit_price, amount,
    picker_id, picker_name, pickup_time,
    audit_status, finance_status, remark,
    create_time, update_time, delete_flag
)
SELECT
    REPLACE(UUID(), '-', '') AS id,
    mp.tenant_id,
    CONCAT('PK', DATE_FORMAT(mp.create_time, '%Y%m%d'),
           LPAD(ROW_NUMBER() OVER (PARTITION BY DATE(mp.create_time) ORDER BY mp.create_time, pi.id), 4, '0'))
        AS pickup_no,
    COALESCE(mp.pickup_type, 'INTERNAL') AS pickup_type,
    mp.order_no,
    mp.style_no,
    pi.material_id,
    pi.material_code,
    pi.material_name,
    pi.material_type,
    pi.color,
    pi.specification,
    pi.quantity,
    pi.unit,
    pi.unit_price,
    CASE WHEN pi.quantity IS NOT NULL AND pi.unit_price IS NOT NULL
         THEN ROUND(pi.quantity * pi.unit_price, 2) ELSE NULL END AS amount,
    mp.picker_id,
    mp.picker_name,
    mp.create_time AS pickup_time,
    'PENDING' AS audit_status,
    'PENDING' AS finance_status,
    CONCAT('AUTO_BACKFILL|pickingNo=', mp.picking_no, '|itemId=', pi.id) AS remark,
    mp.create_time,
    NOW() AS update_time,
    0 AS delete_flag
FROM t_material_picking mp
JOIN t_material_picking_item pi ON pi.picking_id = mp.id
WHERE mp.picking_no LIKE 'PICK-%'
  AND mp.delete_flag = 0
  AND mp.status = 'completed'
  AND NOT EXISTS (
      SELECT 1 FROM t_material_pickup_record pr
      WHERE pr.remark LIKE CONCAT('AUTO_BACKFILL|pickingNo=', mp.picking_no, '%')
        AND pr.delete_flag = 0
  );