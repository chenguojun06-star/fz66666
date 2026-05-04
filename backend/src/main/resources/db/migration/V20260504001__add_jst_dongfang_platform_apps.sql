-- V20260504001: 应用商店新增聚水潭 + 东纺纺织 对接应用
-- 价格锚定现有电商平台：月付对标淘宝149-抖音299，买断统一19999

INSERT INTO t_app_store (app_code, app_name, app_icon, app_desc, category, price_monthly, price_yearly, price_once, trial_days, sort_order, is_hot, is_new, status, features)
VALUES
('EC_JST',        '聚水潭',     'jst',  '对接聚水潭ERP中台，聚合淘宝/京东/拼多多等多平台订单，自动拉取订单、客户、店铺数据',   'ECOMMERCE', 299.00, 2990.00, 19999.00, 7, 108, 0, 1, 'PUBLISHED', '多平台订单聚合,自动店铺发现,客户归集,物流回传'),
('EC_DONGFANG',   '东纺纺织',   'df',   '对接东纺纺织平台，同步面料产品、供应商、采购订单数据',                       'SUPPLY_CHAIN', 199.00, 1990.00, 19999.00, 7, 109, 0, 1, 'PUBLISHED', '面料同步,供应商对接,采购订单,库存联动')
ON DUPLICATE KEY UPDATE
  app_name      = VALUES(app_name),
  app_icon      = VALUES(app_icon),
  app_desc      = VALUES(app_desc),
  price_monthly = VALUES(price_monthly),
  price_yearly  = VALUES(price_yearly),
  price_once    = VALUES(price_once),
  trial_days    = VALUES(trial_days),
  status        = VALUES(status);
