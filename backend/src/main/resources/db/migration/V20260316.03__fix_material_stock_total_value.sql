-- V20260316c: 修复 t_material_stock.total_value 与实际库存数量不一致的脏数据
-- 历史原因：出库操作（decreaseStockWithCheck / updateStockQuantity）只更新 quantity，
--   未同步更新 total_value，导致库存已清零但 total_value 仍显示旧金额。
-- 修复：一次性将所有行的 total_value 重算为 GREATEST(0, quantity) * unit_price

UPDATE t_material_stock
SET total_value = ROUND(GREATEST(0, COALESCE(quantity, 0)) * COALESCE(unit_price, 0), 2)
WHERE total_value != ROUND(GREATEST(0, COALESCE(quantity, 0)) * COALESCE(unit_price, 0), 2)
   OR total_value IS NULL;
