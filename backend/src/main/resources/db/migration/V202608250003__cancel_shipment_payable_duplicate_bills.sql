-- D-132: 清理出货对账单重复推送的遗留应付账单
-- 外发工厂应付此前由出货对账单一创建就自动推 PAYABLE 账单，与成品结算终审推送双轨并存（重复付款风险）。
-- D-132 起代码层面已停推；本迁移一次性作废仍未被确认的 PENDING 遗留账单。
-- 已 CONFIRMED/SETTLING/SETTLED 的不动（可能已进入付款流程，由财务人工处理）。
-- 幂等性：只匹配 PENDING，重复执行第二遍匹配 0 行。
UPDATE t_bill_aggregation
SET status = 'CANCELLED',
    update_time = NOW(),
    remark = CONCAT(COALESCE(remark, ''), ' | D-132 外发应付统一走成品结算终审，此账单已作废')
WHERE source_type = 'SHIPMENT_RECONCILIATION'
  AND bill_type = 'PAYABLE'
  AND status = 'PENDING';
