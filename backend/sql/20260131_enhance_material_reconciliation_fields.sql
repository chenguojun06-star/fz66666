-- 物料对账表字段完善
-- 添加采购类型、样衣关联、时间字段，实现完整的数据追溯
-- 执行时间: 2026-01-31
-- 作者: Fashion Supply Chain System

USE fashion_supplychain;

-- 1. 添加采购类型字段（区分样衣采购和批量采购）
ALTER TABLE t_material_reconciliation
ADD COLUMN source_type VARCHAR(20) COMMENT '采购类型: order=批量订单, sample=样衣开发' AFTER purchase_no;

-- 2. 添加样衣生产ID（样衣采购时关联）
ALTER TABLE t_material_reconciliation
ADD COLUMN pattern_production_id VARCHAR(36) COMMENT '样衣生产ID' AFTER order_no;

-- 3. 添加预计到货日期（从采购单同步）
ALTER TABLE t_material_reconciliation
ADD COLUMN expected_arrival_date DATETIME COMMENT '预计到货日期' AFTER reconciliation_date;

-- 4. 添加实际到货日期（从采购单同步）
ALTER TABLE t_material_reconciliation
ADD COLUMN actual_arrival_date DATETIME COMMENT '实际到货日期' AFTER expected_arrival_date;

-- 5. 添加入库日期（从入库记录同步）
ALTER TABLE t_material_reconciliation
ADD COLUMN inbound_date DATETIME COMMENT '入库日期' AFTER actual_arrival_date;
-- 6. 添加仓库库区（从入库记录同步）
ALTER TABLE t_material_reconciliation
ADD COLUMN warehouse_location VARCHAR(100) COMMENT '仓库库区' AFTER inbound_date;
-- 验证字段
SELECT
  COLUMN_NAME AS '字段名',
  COLUMN_TYPE AS '类型',
  COLUMN_COMMENT AS '说明'
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='fashion_supplychain'
AND TABLE_NAME='t_material_reconciliation'
AND COLUMN_NAME IN ('source_type', 'pattern_production_id', 'expected_arrival_date', 'actual_arrival_date', 'inbound_date');

/*
字段说明：

1. source_type (采购类型)
   - order: 批量生产订单采购
   - sample: 样衣开发采购
   用途: 区分不同的采购场景，便于统计和对账

2. pattern_production_id (样衣生产ID)
   - 当 source_type='sample' 时，关联到 t_pattern_production
   - 当 source_type='order' 时，为 NULL
   用途: 追溯样衣采购的来源

3. expected_arrival_date (预计到货日期)
   - 从 t_material_purchase.expected_arrival_date 同步
   用途: 对比预期和实际，分析供应商履约情况

4. actual_arrival_date (实际到货日期)
   - 从 t_material_purchase.actual_arrival_date 同步
   用途: 实际到货时间，财务对账依据

5. inbound_date (入库日期)
   - 从 t_material_inbound.inbound_time 同步
   用途: 实际入库时间，与到货时间可能不同

完整时间链：
采购下单 → 预计到货 → 实际到货 → 入库 → 对账周期
*/
