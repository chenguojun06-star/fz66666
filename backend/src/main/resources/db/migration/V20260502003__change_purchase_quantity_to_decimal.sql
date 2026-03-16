-- V20260502003 — 将 t_material_purchase.purchase_quantity 从 INT 改为 DECIMAL(12,4)
-- 原因：采购需求量需要支持小数（含损耗率后精确值），INT CEILING 会导致数量虚高

SET @col_type = (
    SELECT DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 't_material_purchase'
      AND COLUMN_NAME  = 'purchase_quantity'
);

SET @s = IF(
    @col_type = 'decimal' OR @col_type = 'numeric',
    'SELECT ''purchase_quantity already decimal, skip'' AS msg',
    'ALTER TABLE `t_material_purchase` MODIFY COLUMN `purchase_quantity` DECIMAL(12,4) NOT NULL DEFAULT 0.0000'
);

PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
