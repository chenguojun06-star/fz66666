-- D-070: 修复物料库存 total_value 历史错算
-- 根因: MaterialStockMapper 4条 UPDATE SQL 的 total_value 表达式在 MySQL SET 从左到右求值语义下
--       读到的 quantity 已是更新后的新值, 又 +/- 一次 delta, 导致库存总值与数量永久脱钩。
--       (例: PKG005 quantity=50, unit_price=0.30, total_value 却为 14.70=49x0.30)
-- 修复: 按当前 quantity x unit_price 全量重算, 消除历史偏差。
UPDATE t_material_stock
SET total_value = ROUND(COALESCE(quantity, 0) * COALESCE(unit_price, 0), 2),
    update_time = NOW()
WHERE delete_flag = 0
  AND NOT (total_value <=> ROUND(COALESCE(quantity, 0) * COALESCE(unit_price, 0), 2));
