-- D-133: 清理面料费双机制/三机制的遗留PENDING账单
-- 方案A确定：面料费统一走「领料扣款抵扣」（MATERIAL_PICKUP 扣款项从加工费中抵扣）。
-- 停推并作废两套旧机制的遗留账单（仅 PENDING 未确认的；已确认/已结算的不动，由财务人工处理）：
--   1) 领料台账审核推送的应收账单（向工厂收面料钱，与扣款并行会双收）
--   2) 物料出库推送的应付账单（供应商款已由物料对账链产生，此处重复；外发厂分支方向本身错误）
-- 幂等性：只匹配 PENDING，重复执行第二遍匹配 0 行。
UPDATE t_bill_aggregation
SET status = 'CANCELLED',
    update_time = NOW(),
    remark = CONCAT(COALESCE(remark, ''), ' | D-133 面料费统一走扣款抵扣(方案A)，此账单已作废')
WHERE status = 'PENDING'
  AND (
    (source_type = 'MATERIAL_PICKUP' AND bill_type = 'RECEIVABLE')
    OR (source_type = 'MATERIAL_OUTBOUND' AND bill_type = 'PAYABLE')
  );
