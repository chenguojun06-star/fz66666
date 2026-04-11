-- 修复历史遗留的系统编排阶段扫码记录 scan_type 字段
--
-- 问题根因：ProductionOrderScanRecordDomainService.upsertStageScanRecord() 对
--   "采购"/"下单"等系统阶段错误写入 scan_type='production'，导致这些 ¥0.00 记录
--   通过 PayrollAggregationOrchestrator 的 scan_type IN ('production','cutting') 过滤，
--   出现在小程序「我的工资」页面，每天随订单推进持续累积。
--
-- 修复：将这些系统阶段记录的 scan_type 改为 'orchestration'，彻底排出工资统计范围。
-- 幂等：WHERE 条件已限定 scan_type='production'，重复执行不影响真实生产记录。

UPDATE t_scan_record
SET
    scan_type   = 'orchestration',
    update_time = NOW()
WHERE
    progress_stage IN (
        '下单', '采购',
        '物料采购', '面辅料采购',
        '备料', '到料',
        '订单创建', '创建订单',
        '开单', '制单'
    )
  AND scan_type = 'production';
