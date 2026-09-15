-- V202709150210 — 回填「最新到货日期」（t_material_purchase.actual_arrival_date）
--
-- 原因（D-414）：
--   订单物料采购明细的「最新到货日期」列整列是 "-"，但同一行明明有到货数量。
--   根因两层：
--     1) 该列取的是 expected_arrival_date（**预计**到货日期），而不是 actual_arrival_date（真实到货时间）；
--     2) actual_arrival_date 只在状态流转到 completed 时才写，分次/部分到货的行永远为空。
--   代码侧已修：每次到货（confirmArrival / updateArrivedQuantity）都回写该字段；
--   本迁移负责把**历史已到货但没日期**的行补上，否则老数据仍显示 "-"。
--
-- 取值优先级：
--   1) 该采购单最后一条入库单的入库时间（t_material_inbound.inbound_time）——最接近真实到货；
--   2) 退化为采购单自身的 update_time。
--
-- 幂等：WHERE 条件限定 actual_arrival_date IS NULL，重复执行不会覆盖已回填的值。

UPDATE `t_material_purchase` p
LEFT JOIN (
    SELECT `purchase_id`, MAX(`inbound_time`) AS last_inbound_time
    FROM `t_material_inbound`
    WHERE (`delete_flag` IS NULL OR `delete_flag` = 0)
      AND `purchase_id` IS NOT NULL
    GROUP BY `purchase_id`
) i ON i.`purchase_id` = p.`id`
SET p.`actual_arrival_date` = COALESCE(i.`last_inbound_time`, p.`update_time`)
WHERE p.`actual_arrival_date` IS NULL
  AND p.`arrived_quantity` > 0;
