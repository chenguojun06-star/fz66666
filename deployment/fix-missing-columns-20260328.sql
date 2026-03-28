-- 修复 t_production_order 表缺少的字段
-- 执行时间: 2026-03-28
-- 问题: Unknown column 'source_biz_type' in 'field list'

-- 添加 source_biz_type 字段（订单业务来源类型）
ALTER TABLE t_production_order 
ADD COLUMN source_biz_type VARCHAR(50) DEFAULT NULL COMMENT '订单业务来源类型（样衣、电商平台等）' 
AFTER order_biz_type;

-- 添加 pushed_to_order 字段（是否已推送至订单系统）
ALTER TABLE t_production_order 
ADD COLUMN pushed_to_order TINYINT DEFAULT 0 COMMENT '是否已推送至订单系统（1=已推送，0=未推送）' 
AFTER source_biz_type;

-- 验证字段是否添加成功
-- SELECT COLUMN_NAME, DATA_TYPE, COLUMN_COMMENT 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 't_production_order' 
-- AND COLUMN_NAME IN ('source_biz_type', 'pushed_to_order');
