-- 面辅料采购单新增 used_quantity（使用量）字段
-- 用于追踪实际出库/领料数量，实现采购量/到货量/使用量/剩余量全链路可视化
-- 关联铁律：财务数据链路闭环（采购→入库→领用→余量）

-- 1. 新增 used_quantity 列（DECIMAL 兼容 BigDecimal，与 purchaseQuantity 类型一致）
ALTER TABLE t_material_purchase ADD COLUMN used_quantity DECIMAL(14,2) DEFAULT 0 COMMENT '使用量（已出库领料数量，自动累加）';

-- 2. 回填历史数据：从 t_material_picking_item JOIN t_material_picking（status=completed）汇总
--    按采购单维度累加已出库数量
UPDATE t_material_purchase mp
SET mp.used_quantity = COALESCE((
    SELECT SUM(mpi.quantity)
    FROM t_material_picking_item mpi
    INNER JOIN t_material_picking mpk ON mpi.picking_id = mpk.id
    WHERE mpk.purchase_id = mp.id
      AND mpk.status = 'completed'
      AND mpk.delete_flag = 0
      AND mpi.quantity IS NOT NULL
      AND mpi.quantity > 0
), 0)
WHERE mp.delete_flag = 0;
