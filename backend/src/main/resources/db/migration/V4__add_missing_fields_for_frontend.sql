-- V4: 添加前端新增字段支持
-- 创建时间: 2026-01-20
-- 说明: 为支持PC端新增的29个字段，添加数据库字段

-- ==================== 1. 物料采购表 - 添加到货日期 ====================
ALTER TABLE t_material_purchase 
ADD COLUMN expected_arrival_date DATETIME COMMENT '预计到货日期',
ADD COLUMN actual_arrival_date DATETIME COMMENT '实际到货日期';

-- ==================== 2. 物料对账表 - 添加付款和责任人字段 ====================
ALTER TABLE t_material_reconciliation 
ADD COLUMN paid_amount DECIMAL(10,2) DEFAULT 0.00 COMMENT '已付金额',
ADD COLUMN period_start_date DATETIME COMMENT '对账周期开始日期',
ADD COLUMN period_end_date DATETIME COMMENT '对账周期结束日期',
ADD COLUMN reconciliation_operator_id VARCHAR(50) COMMENT '对账人ID',
ADD COLUMN reconciliation_operator_name VARCHAR(50) COMMENT '对账人姓名',
ADD COLUMN audit_operator_id VARCHAR(50) COMMENT '审核人ID',
ADD COLUMN audit_operator_name VARCHAR(50) COMMENT '审核人姓名';

-- ==================== 3. 质检入库表 - 添加质检人员字段 ====================
ALTER TABLE t_product_warehousing 
ADD COLUMN quality_operator_id VARCHAR(50) COMMENT '质检人员ID',
ADD COLUMN quality_operator_name VARCHAR(50) COMMENT '质检人员姓名';

-- ==================== 说明 ====================
-- ProductionOrder表不需要ALTER TABLE，因为新增字段都是通过聚合查询得到的临时字段(@TableField(exist = false))
-- 车缝、大烫、包装环节数据从t_scan_record表聚合
-- 质量统计数据从t_product_warehousing表聚合
