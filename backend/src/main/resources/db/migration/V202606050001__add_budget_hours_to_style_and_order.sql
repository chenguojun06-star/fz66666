-- 款式开发环节预算工时字段
-- 每个环节可独立设定预算时间（小时），用于科学计算实际耗时和等待时间
-- 注意：列的幂等性由 DbColumnRepairRunner 保证，此处不使用 IF NOT EXISTS（MySQL 不支持）

-- t_style_info 预算工时列由 DbColumnRepairRunner 自动补建
-- t_production_order 预算工时列由 DbColumnRepairRunner 自动补建

-- 此迁移文件为占位文件，实际列创建由 DbColumnDefinitions + DbColumnRepairRunner 在应用启动时执行
SELECT 1;
