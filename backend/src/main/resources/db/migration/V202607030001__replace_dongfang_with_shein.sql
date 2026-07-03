-- V202607030001: 替换东纺纺织为希音(SHEIN)平台
-- 东纺纺织已废弃，新增希音跨境电商平台对接

-- 1. 将东纺纺织标记为下架
UPDATE t_app_store 
SET status = 'OFFLINE', app_desc = '已废弃，请使用其他平台'
WHERE app_code = 'EC_DONGFANG';

-- 2. 新增希音平台
INSERT INTO t_app_store (app_code, app_name, app_icon, app_desc, category, price_monthly, price_yearly, price_once, trial_days, sort_order, is_hot, is_new, status, features)
VALUES
('EC_SHEIN',      '希音',       'sy',  '对接希音(SHEIN)跨境电商平台，同步订单与物流',   'ECOMMERCE', 299.00, 2990.00, 19999.00, 7, 109, 0, 1, 'PUBLISHED', '订单同步,物流回传,库存同步')
ON DUPLICATE KEY UPDATE
  app_name      = VALUES(app_name),
  app_icon      = VALUES(app_icon),
  app_desc      = VALUES(app_desc),
  category      = VALUES(category),
  price_monthly = VALUES(price_monthly),
  price_yearly  = VALUES(price_yearly),
  price_once    = VALUES(price_once),
  trial_days    = VALUES(trial_days),
  sort_order    = VALUES(sort_order),
  is_hot        = VALUES(is_hot),
  is_new        = VALUES(is_new),
  status        = VALUES(status),
  features      = VALUES(features);