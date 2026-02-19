-- 添加采购完成确认字段
-- 用于支持物料到货率≥50%时人为确认采购完成的功能

USE fashion_supplychain;

-- 添加采购人工确认完成标志
ALTER TABLE t_production_order
ADD COLUMN procurement_manually_completed TINYINT DEFAULT 0 COMMENT '采购人工确认完成(0=未确认, 1=已确认)' AFTER material_arrival_rate;

-- 添加采购确认人ID
ALTER TABLE t_production_order
ADD COLUMN procurement_confirmed_by VARCHAR(50) COMMENT '采购确认人ID' AFTER procurement_manually_completed;

-- 添加采购确认人姓名
ALTER TABLE t_production_order
ADD COLUMN procurement_confirmed_by_name VARCHAR(100) COMMENT '采购确认人姓名' AFTER procurement_confirmed_by;

-- 添加采购确认时间
ALTER TABLE t_production_order
ADD COLUMN procurement_confirmed_at DATETIME COMMENT '采购确认时间' AFTER procurement_confirmed_by_name;

-- 添加采购确认备注（说明为什么物料未到齐就确认）
ALTER TABLE t_production_order
ADD COLUMN procurement_confirm_remark VARCHAR(500) COMMENT '采购确认备注' AFTER procurement_confirmed_at;
