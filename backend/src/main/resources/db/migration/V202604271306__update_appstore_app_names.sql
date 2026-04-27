-- 更正两个应用商店应用名称
-- 业务背景：
--   V20260425003 设置了 FINANCE_TAX='财税对接' 和 PROCUREMENT='供应商采购'
--   但产品确认的名称分别为 '财务对接' 和 '智能采购'，本脚本进行更正。
-- 幂等安全：WHERE app_code 精确匹配，重复执行无副作用。

-- 1. 财务对接（原"财税对接"，更贴合产品定位）
UPDATE t_app_store
SET app_name = '财务对接'
WHERE app_code = 'FINANCE_TAX';

-- 2. 智能采购（原"供应商采购"，突出 AI 辅助能力）
UPDATE t_app_store
SET app_name = '智能采购'
WHERE app_code = 'PROCUREMENT';
