-- 应用商店价格调整 2026-02-22
-- 月付大幅降低，新增买断永久价格（统一 19999）
UPDATE t_app_store SET price_monthly=299, price_yearly=2990, price_once=19999 WHERE app_code='ORDER_SYNC';
UPDATE t_app_store SET price_monthly=199, price_yearly=1990, price_once=19999 WHERE app_code='QUALITY_FEEDBACK';
UPDATE t_app_store SET price_monthly=149, price_yearly=1490, price_once=19999 WHERE app_code='LOGISTICS_SYNC';
UPDATE t_app_store SET price_monthly=199, price_yearly=1990, price_once=19999 WHERE app_code='PAYMENT_SYNC';
UPDATE t_app_store SET price_monthly=249, price_yearly=2490, price_once=19999 WHERE app_code='MATERIAL_SUPPLY';

-- 验证
SELECT app_name, price_monthly, price_yearly, price_once FROM t_app_store ORDER BY sort_order;
