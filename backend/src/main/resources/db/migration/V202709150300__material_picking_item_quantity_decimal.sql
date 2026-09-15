-- V202709150300 — 生产领料单明细数量支持小数（INT → DECIMAL(12,4)）
--
-- 原因（D-414，承接 D-410 / V202709150200）：
--   D-410 已把 到货 / 入库 / 库存 / 对账 改为 DECIMAL(12,4)，
--   V202709150200 又把 出库单 t_material_outbound_log.quantity 改为 DECIMAL(12,4)，
--   只剩 **领料单明细 t_material_picking_item.quantity 仍是 INT**，是全链路最后一个整数缺口。
--
--   领料单被截断的后果与出库同源且更隐蔽：
--     - 仓库按 1.32 米领料，落库只有 1 → 出库流水记 1、库存按 1 扣，实际领走 1.32
--     - 领料单回冲/取消解锁库存时同样按 1 回滚 → 锁定量对不上
--   前端领料数量输入框不限制精度，用户可以输小数，后端静默取整。
--
--   与 arrived_quantity / inbound_quantity / outbound.quantity 保持同一精度 DECIMAL(12,4)。

-- 幂等：先查 INFORMATION_SCHEMA.COLUMNS 的 DATA_TYPE，已是 decimal/numeric 则跳过。
SET @col_type = (
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_picking_item'
      AND COLUMN_NAME  = 'quantity'
);

SET @s = IF(
    @col_type = 'decimal' OR @col_type = 'numeric',
    'SELECT ''t_material_picking_item.quantity already decimal, skip'' AS msg',
    'ALTER TABLE `t_material_picking_item` MODIFY COLUMN `quantity` DECIMAL(12,4) NULL DEFAULT NULL COMMENT ''领料数量'''
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
