-- 为订单表和物料采购表添加快速编辑字段
-- 执行时间：2026-01-25

-- 1. 订单表添加字段
ALTER TABLE t_production_order ADD COLUMN remarks VARCHAR(500) COMMENT '备注';
ALTER TABLE t_production_order ADD COLUMN expected_ship_date DATE COMMENT '预计出货日期';

-- 2. 物料采购表添加预计出货字段（remark字段已存在）
ALTER TABLE t_material_purchase ADD COLUMN expected_ship_date DATE COMMENT '预计出货日期';

-- 3. 裁剪任务表添加字段（可选）
ALTER TABLE t_cutting_task ADD COLUMN remarks VARCHAR(500) COMMENT '备注';
ALTER TABLE t_cutting_task ADD COLUMN expected_ship_date DATE COMMENT '预计出货日期';
