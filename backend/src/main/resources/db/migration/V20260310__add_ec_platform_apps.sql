-- V20260310: 向应用商店插入 8 个电商平台对接应用条目
-- 云端 FLYWAY_ENABLED=false，需在微信云托管控制台数据库面板手动执行此 SQL

INSERT INTO t_app_store (app_code, app_name, app_icon, app_desc, category, price_monthly, price_yearly, sort_order, is_hot, is_new, status, features)
VALUES
('EC_TAOBAO',      '淘宝',       'tb',  '对接淘宝平台，导入订单、同步库存',         'ECOMMERCE', 149.00, 1490.00, 100, 1, 0, 'PUBLISHED', '订单导入,库存同步,发货管理'),
('EC_TMALL',       '天猫',       'tm',  '对接天猫旗舰店，管理品牌订单与退换货',     'ECOMMERCE', 199.00, 1990.00, 101, 1, 0, 'PUBLISHED', '订单导入,库存同步,退换货管理'),
('EC_JD',          '京东',       'jd',  '对接京东平台，实时同步订单与物流',         'ECOMMERCE', 249.00, 2490.00, 102, 0, 0, 'PUBLISHED', '订单同步,物流跟踪,库存管理'),
('EC_DOUYIN',      '抖音',       'dy',  '对接抖音小店，直播带货订单自动流转',       'ECOMMERCE', 299.00, 2990.00, 103, 1, 1, 'PUBLISHED', '订单导入,直播订单,物流管理'),
('EC_PINDUODUO',   '拼多多',     'pdd', '对接拼多多，批量订单处理与发货',           'ECOMMERCE', 149.00, 1490.00, 104, 0, 0, 'PUBLISHED', '订单导入,批量发货,库存同步'),
('EC_XIAOHONGSHU', '小红书',     'xhs', '对接小红书商城，内容种草带来的订单管理',   'ECOMMERCE', 199.00, 1990.00, 105, 0, 1, 'PUBLISHED', '订单管理,笔记联动,库存同步'),
('EC_WECHAT_SHOP', '微信小店',   'wx',  '对接微信小店与视频号，私域订单全管理',     'ECOMMERCE', 149.00, 1490.00, 106, 0, 0, 'PUBLISHED', '订单同步,私域管理,客户管理'),
('EC_SHOPIFY',     'Shopify',    'sf',  '对接 Shopify 独立站，跨境订单一体化管理', 'ECOMMERCE', 299.00, 2990.00, 107, 0, 1, 'PUBLISHED', '订单同步,多币种,物流对接')
ON DUPLICATE KEY UPDATE
  app_name      = VALUES(app_name),
  app_icon      = VALUES(app_icon),
  app_desc      = VALUES(app_desc),
  price_monthly = VALUES(price_monthly),
  price_yearly  = VALUES(price_yearly),
  status        = VALUES(status);
