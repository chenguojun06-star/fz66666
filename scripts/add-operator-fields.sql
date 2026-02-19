-- ============================================
-- 全系统操作人字段补充脚本
-- 创建时间：2026-02-05
-- 说明：为各业务表补充操作人记录字段，支持外协工厂场景
-- ============================================

USE fashion_supplychain;

-- ============================================
-- 1. 裁剪任务表 (t_cutting_task)
-- ============================================
ALTER TABLE t_cutting_task
ADD COLUMN IF NOT EXISTS operator_id VARCHAR(50) COMMENT '操作人ID (创建人)' AFTER updated_at,
ADD COLUMN IF NOT EXISTS operator_name VARCHAR(100) COMMENT '操作人姓名' AFTER operator_id,
ADD COLUMN IF NOT EXISTS is_outsourced TINYINT(1) DEFAULT 0 COMMENT '是否外协工厂' AFTER operator_name;

CREATE INDEX IF NOT EXISTS idx_cutting_operator ON t_cutting_task(operator_name);

-- ============================================
-- 2. 样板生产表 (t_pattern_revision) - 审批人
-- ============================================
ALTER TABLE t_pattern_revision
ADD COLUMN IF NOT EXISTS approver_id VARCHAR(50) COMMENT '审批人ID' AFTER pattern_maker_name,
ADD COLUMN IF NOT EXISTS approver_name VARCHAR(100) COMMENT '审批人姓名' AFTER approver_id,
ADD COLUMN IF NOT EXISTS approved_at DATETIME COMMENT '审批时间' AFTER approver_name;

CREATE INDEX IF NOT EXISTS idx_pattern_approver ON t_pattern_revision(approver_name);

-- ============================================
-- 3. 款式管理表 (t_style_info) - 最终审批人
-- ============================================
ALTER TABLE t_style_info
ADD COLUMN IF NOT EXISTS approved_by_id VARCHAR(50) COMMENT '最终审批人ID' AFTER updated_at,
ADD COLUMN IF NOT EXISTS approved_by_name VARCHAR(100) COMMENT '最终审批人姓名' AFTER approved_by_id,
ADD COLUMN IF NOT EXISTS approved_at DATETIME COMMENT '最终审批时间' AFTER approved_by_name;

CREATE INDEX IF NOT EXISTS idx_style_approver ON t_style_info(approved_by_name);

-- ============================================
-- 4. 材料对账表 (t_material_reconciliation) - 审批人
-- ============================================
ALTER TABLE t_material_reconciliation
ADD COLUMN IF NOT EXISTS approved_by_id VARCHAR(50) COMMENT '审批人ID' AFTER updated_at,
ADD COLUMN IF NOT EXISTS approved_by_name VARCHAR(100) COMMENT '审批人姓名' AFTER approved_by_id,
ADD COLUMN IF NOT EXISTS approved_at DATETIME COMMENT '审批时间' AFTER approved_by_name;

CREATE INDEX IF NOT EXISTS idx_material_rec_approver ON t_material_reconciliation(approved_by_name);

-- ============================================
-- 5. 工资结算表 (t_payroll_settlement) - 审批人、支付人
-- ============================================
ALTER TABLE t_payroll_settlement
ADD COLUMN IF NOT EXISTS approved_by_id VARCHAR(50) COMMENT '审批人ID' AFTER updated_at,
ADD COLUMN IF NOT EXISTS approved_by_name VARCHAR(100) COMMENT '审批人姓名' AFTER approved_by_id,
ADD COLUMN IF NOT EXISTS approved_at DATETIME COMMENT '审批时间' AFTER approved_by_name,
ADD COLUMN IF NOT EXISTS paid_by_id VARCHAR(50) COMMENT '支付人ID' AFTER approved_at,
ADD COLUMN IF NOT EXISTS paid_by_name VARCHAR(100) COMMENT '支付人姓名' AFTER paid_by_id,
ADD COLUMN IF NOT EXISTS paid_at DATETIME COMMENT '支付时间' AFTER paid_by_name;

CREATE INDEX IF NOT EXISTS idx_payroll_approver ON t_payroll_settlement(approved_by_name);
CREATE INDEX IF NOT EXISTS idx_payroll_payer ON t_payroll_settlement(paid_by_name);

-- ============================================
-- 6. 物料入库记录表 (t_material_inbound) - 入库操作人
-- ============================================
-- 检查表是否存在，如果存在则添加字段
-- SELECT COUNT(*) INTO @table_exists FROM information_schema.tables
-- WHERE table_schema = 'fashion_supplychain' AND table_name = 't_material_inbound';

-- SET @sql = IF(@table_exists > 0,
--     'ALTER TABLE t_material_inbound
--      ADD COLUMN IF NOT EXISTS operator_id VARCHAR(50) COMMENT ''入库操作人ID'',
--      ADD COLUMN IF NOT EXISTS operator_name VARCHAR(100) COMMENT ''入库操作人姓名''',
--     'SELECT ''表 t_material_inbound 不存在，跳过'' AS message'
-- );
-- PREPARE stmt FROM @sql;
-- EXECUTE stmt;
-- DEALLOCATE PREPARE stmt;

-- ============================================
-- 7. 生产订单表 (t_production_order) - 补充外协标识
-- ============================================
ALTER TABLE t_production_order
ADD COLUMN IF NOT EXISTS is_outsourced TINYINT(1) DEFAULT 0 COMMENT '是否外协订单' AFTER factory_name;

-- ============================================
-- 8. 扫码记录表 (t_scan_record) - 补充外协标识
-- ============================================
ALTER TABLE t_scan_record
ADD COLUMN IF NOT EXISTS is_outsourced TINYINT(1) DEFAULT 0 COMMENT '是否外协操作' AFTER operator_name;

-- ============================================
-- 数据迁移：根据工厂名称自动标记外协订单
-- ============================================
UPDATE t_production_order
SET is_outsourced = 1
WHERE factory_name LIKE '%外协%'
   OR factory_name LIKE '%外发%'
   OR factory_name LIKE '%外包%'
   OR factory_name LIKE '%代工%'
   OR factory_name LIKE '%外厂%';

-- ============================================
-- 验证结果
-- ============================================
SELECT '裁剪任务表字段' AS 表名,
       COUNT(*) AS 字段数
FROM information_schema.columns
WHERE table_schema = 'fashion_supplychain'
  AND table_name = 't_cutting_task'
  AND column_name IN ('operator_id', 'operator_name', 'is_outsourced');

SELECT '样板生产表字段' AS 表名,
       COUNT(*) AS 字段数
FROM information_schema.columns
WHERE table_schema = 'fashion_supplychain'
  AND table_name = 't_pattern_revision'
  AND column_name IN ('approver_id', 'approver_name', 'approved_at');

SELECT '款式管理表字段' AS 表名,
       COUNT(*) AS 字段数
FROM information_schema.columns
WHERE table_schema = 'fashion_supplychain'
  AND table_name = 't_style_info'
  AND column_name IN ('approved_by_id', 'approved_by_name', 'approved_at');

SELECT '材料对账表字段' AS 表名,
       COUNT(*) AS 字段数
FROM information_schema.columns
WHERE table_schema = 'fashion_supplychain'
  AND table_name = 't_material_reconciliation'
  AND column_name IN ('approved_by_id', 'approved_by_name', 'approved_at');

SELECT '工资结算表字段' AS 表名,
       COUNT(*) AS 字段数
FROM information_schema.columns
WHERE table_schema = 'fashion_supplychain'
  AND table_name = 't_payroll_settlement'
  AND column_name IN ('approved_by_id', 'approved_by_name', 'approved_at', 'paid_by_id', 'paid_by_name', 'paid_at');

SELECT '外协订单统计' AS 类型,
       COUNT(*) AS 数量
FROM t_production_order
WHERE is_outsourced = 1;

-- ============================================
-- 完成提示
-- ============================================
SELECT '✅ 操作人字段补充完成！' AS 状态,
       NOW() AS 完成时间;
