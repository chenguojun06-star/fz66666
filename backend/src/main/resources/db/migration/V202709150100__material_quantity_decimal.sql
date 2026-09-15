-- V202709150100 — 物料「到货/入库/对账」数量支持小数（INT → DECIMAL(12,4)）
--
-- 原因（P0 财务口径）：
--   面料按「米 / 公斤 / 码」计量时，采购量与到货量都是小数（如采购 1.32 米、到货 1.32 米）。
--   但 t_material_purchase.arrived_quantity / t_material_inbound.inbound_quantity /
--   t_material_reconciliation.quantity 仍是 INT，前端「登记到货」输入框明明支持两位小数
--   （step=0.01 precision=2），后端却用 int 接收 → 1.32 被静默截断成 1。
--   后果：对账单按「到货量 × 单价」结算（MaterialReconciliationOrchestrator 已如此实现，
--   目的是避免部分到货时应付虚增），数量被截断后 1×60=¥60，而真实应付 1.32×60=¥79.20，
--   **少付货款**；同时采购单打印按「采购量 × 单价」显示 ¥79.20，两边对不上。
--
--   与 purchase_quantity（V20260502003 已改为 DECIMAL(12,4)）保持同一精度，
--   避免采购量与到货量精度不一致再次产生差额。
--
-- 幂等：先查 INFORMATION_SCHEMA.COLUMNS 的 DATA_TYPE，已是 decimal/numeric 则跳过。

-- 1) 到货数量
SET @col_type = (
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_purchase'
      AND COLUMN_NAME  = 'arrived_quantity'
);

SET @s = IF(
    @col_type = 'decimal' OR @col_type = 'numeric',
    'SELECT ''t_material_purchase.arrived_quantity already decimal, skip'' AS msg',
    'ALTER TABLE `t_material_purchase` MODIFY COLUMN `arrived_quantity` DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT ''到货数量'''
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2) 入库数量
SET @col_type = (
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_inbound'
      AND COLUMN_NAME  = 'inbound_quantity'
);

SET @s = IF(
    @col_type = 'decimal' OR @col_type = 'numeric',
    'SELECT ''t_material_inbound.inbound_quantity already decimal, skip'' AS msg',
    'ALTER TABLE `t_material_inbound` MODIFY COLUMN `inbound_quantity` DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT ''入库数量'''
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) 库存数量（入库台账写 1.32 米，库存却只加 1 → 账实不符，必须与入库同精度）
SET @col_type = (
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_stock'
      AND COLUMN_NAME  = 'quantity'
);

SET @s = IF(
    @col_type = 'decimal' OR @col_type = 'numeric',
    'SELECT ''t_material_stock.quantity already decimal, skip'' AS msg',
    'ALTER TABLE `t_material_stock` MODIFY COLUMN `quantity` DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT ''库存数量'''
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) 对账数量（对账单金额 = 单价 × 该数量，必须同精度，否则结算仍会偏差）
SET @col_type = (
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_reconciliation'
      AND COLUMN_NAME  = 'quantity'
);

SET @s = IF(
    @col_type = 'decimal' OR @col_type = 'numeric',
    'SELECT ''t_material_reconciliation.quantity already decimal, skip'' AS msg',
    'ALTER TABLE `t_material_reconciliation` MODIFY COLUMN `quantity` DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT ''对账数量'''
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
