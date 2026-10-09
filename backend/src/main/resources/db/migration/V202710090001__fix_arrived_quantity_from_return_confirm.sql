-- D-513：修复「回料确认未回写到货量」造成的历史数据不一致
--
-- 背景（真实 bug）：
--   回料确认（MaterialPurchaseReturnHelper.buildReturnPatch）只写了 return_quantity（实际到货），
--   **没有回写 arrived_quantity**，于是 arrived_quantity 一直停留在 confirmComplete 的兜底值
--   （= purchase_quantity 预采购数）。后果：
--     ① 物料对账的「实到数量」取到的是预采购数（供应商多送按计划数结算 → 少算货款）；
--     ② 采购列表靠 repairRecords 临时把 arrived_quantity 顶成 return_quantity 才显示正确，
--        列表与对账两处口径不一致。
--   代码侧已在 MaterialPurchaseReturnHelper 修复（回料确认时同步回写 arrived_quantity）。
--   本迁移负责把**历史已确认回料**但未同步的采购补齐 —— 属于「把已确认的事实落到该落的列」，
--   不臆造数据：只处理 return_confirmed=1 且 return_quantity>0 的记录。
--
-- 同时按「实际到货 × 单价」重算采购总额（与 D-464 声明口径一致，此前用旧的 arrived_quantity 算）。

UPDATE t_material_purchase
SET arrived_quantity = return_quantity,
    total_amount = ROUND(COALESCE(unit_price, 0) * return_quantity, 2)
WHERE delete_flag = 0
  AND return_confirmed = 1
  AND return_quantity IS NOT NULL
  AND return_quantity > 0
  AND (arrived_quantity IS NULL OR arrived_quantity <> return_quantity);
