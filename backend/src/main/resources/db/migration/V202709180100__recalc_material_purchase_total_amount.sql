-- V202709180100 — 存量采购单金额订正为「实际到货数量 × 单价」
--
-- 原因（D-464）：
--   代码口径已从「采购数量 × 单价」（D-076/D-129）切换为「**实际到货数量** × 单价」，
--   但 t_material_purchase.total_amount 里躺着的是**按旧口径落库的历史值**：
--     - 采购 375 米 / 到货 375.5 米 → 库里仍是 375 × 单价（少算）
--     - 采购 300 米 / 只到 100 米 → 库里是 300 × 单价（虚高，钱没花却挂了应付）
--   不订正的话，新数据按到货算、老数据按采购算，同一张表两种口径 —— 对账、付款、比价全乱。
--
-- 口径：total_amount = ROUND(unit_price × arrived_quantity, 2)，未到货（arrived=0）记 0。
-- 幂等：按目标值不等式过滤，重复执行不会再产生更新（结果恒等于目标值）。

UPDATE `t_material_purchase`
SET `total_amount` = ROUND(COALESCE(`unit_price`, 0) * COALESCE(`arrived_quantity`, 0), 2)
WHERE `total_amount` IS NULL
   OR `total_amount` <> ROUND(COALESCE(`unit_price`, 0) * COALESCE(`arrived_quantity`, 0), 2);
