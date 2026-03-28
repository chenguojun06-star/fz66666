-- 检查本地 vs 云端 t_style_info 列差异
-- 本地列（82个）
SELECT '本地列' as source, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'fashion_supplychain' AND TABLE_NAME = 't_style_info'
ORDER BY COLUMN_NAME;