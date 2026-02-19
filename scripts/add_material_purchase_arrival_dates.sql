-- 添加面辅料采购的到货日期字段
-- 修复 SQL 错误: Unknown column 'expected_arrival_date' in 'field list'

USE fashion_supplychain;

-- 添加预计到货日期
ALTER TABLE t_material_purchase 
ADD COLUMN expected_arrival_date DATETIME COMMENT '预计到货日期' AFTER delete_flag;

-- 添加实际到货日期
ALTER TABLE t_material_purchase 
ADD COLUMN actual_arrival_date DATETIME COMMENT '实际到货日期' AFTER expected_arrival_date;
