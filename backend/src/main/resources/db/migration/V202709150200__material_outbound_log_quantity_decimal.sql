-- V202709150200 — 物料「出库」数量支持小数（INT → DECIMAL(12,4)）
--
-- 原因（承接 D-410 / D-413）：
--   D-410 已把 到货(t_material_purchase.arrived_quantity) / 入库(t_material_inbound.inbound_quantity) /
--   库存(t_material_stock.quantity) / 对账(t_material_reconciliation.quantity) 改为 DECIMAL(12,4)，
--   但 **出库单 t_material_outbound_log.quantity 仍是 INT**，当时标注「需另开迁移」。
--
--   于是出库这条链路仍在静默截断：
--     - MaterialStockController.scanOutbound 用 ((Number) qty).intValue()
--     - MaterialWarehouseOperationOrchestrator.freeOutbound 用 toInt(params.get("quantity"))
--   前端扫码出库 / 自由出库的数量输入框并未限制精度，用户输入 1.32 米 → 后端截成 1，
--   库存按 1 扣减、出库单记 1，而用户实际领走 1.32 → **账实不符**（与 D-410 修的是同一类 P0）。
--
--   与 arrived_quantity / inbound_quantity 保持同一精度 DECIMAL(12,4)，
--   避免「进 1.32 / 出 1」再次产生差额。

-- 幂等：先查 INFORMATION_SCHEMA.COLUMNS 的 DATA_TYPE，已是 decimal/numeric 则跳过。
SET @col_type = (
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_outbound_log'
      AND COLUMN_NAME  = 'quantity'
);

SET @s = IF(
    @col_type = 'decimal' OR @col_type = 'numeric',
    'SELECT ''t_material_outbound_log.quantity already decimal, skip'' AS msg',
    'ALTER TABLE `t_material_outbound_log` MODIFY COLUMN `quantity` DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT ''出库数量'''
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
