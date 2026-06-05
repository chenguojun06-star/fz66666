-- 款式开发环节预算工时字段
-- 每个环节可独立设定预算时间（小时），用于科学计算实际耗时和等待时间

ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS bom_budget_hours INT DEFAULT NULL;
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS pattern_budget_hours INT DEFAULT NULL;
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS size_budget_hours INT DEFAULT NULL;
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS process_budget_hours INT DEFAULT NULL;
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS production_budget_hours INT DEFAULT NULL;
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS secondary_budget_hours INT DEFAULT NULL;
ALTER TABLE t_style_info ADD COLUMN IF NOT EXISTS size_price_budget_hours INT DEFAULT NULL;

-- 生产订单各环节预算工时字段
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS procurement_budget_hours INT DEFAULT NULL;
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS cutting_budget_hours INT DEFAULT NULL;
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS secondary_process_budget_hours INT DEFAULT NULL;
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS car_sewing_budget_hours INT DEFAULT NULL;
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS ironing_budget_hours INT DEFAULT NULL;
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS packaging_budget_hours INT DEFAULT NULL;
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS quality_budget_hours INT DEFAULT NULL;
ALTER TABLE t_production_order ADD COLUMN IF NOT EXISTS warehousing_budget_hours INT DEFAULT NULL;
