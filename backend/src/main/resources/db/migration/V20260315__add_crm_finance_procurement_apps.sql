-- V20260315: 新增三个独立售卖模块 — 客户管理、财税对接、供应商采购
-- 云端 FLYWAY_ENABLED=false，需在微信云托管控制台数据库面板手动执行此 SQL

INSERT INTO t_app_store (app_code, app_name, app_icon, app_desc, category, price_monthly, price_yearly, price_once, trial_days, sort_order, is_hot, is_new, status, features)
VALUES
('CRM_MODULE',  '客户管理',   '👥', '客户档案管理、应收账款跟踪、客户查询门户（扫码查进度）。深度整合生产数据，一站式管理您的客户关系与回款。',          'CRM',          799.00,  7990.00, 29999.00, 14, 200, 1, 1, 'PUBLISHED', '客户档案,应收账款,客户查询门户,历史订单汇总,催款提醒'),
('FINANCE_TAX', '财税对接',   '📊', '一键导出金蝶KIS / 用友T3 格式账目，工资汇总表、物料对账单、发货记录单全覆盖，告别手工录入，3分钟完成月结。', 'FINANCE',      499.00,  4990.00, 19999.00,  7, 201, 1, 1, 'PUBLISHED', '金蝶KIS导出,用友T3导出,工资汇总,物料对账,发货记录'),
('PROCUREMENT', '供应商采购', '🏭', '采购订单管理、收货确认、应付账款核算，与仓库库存深度联动，自动触发缺料预警，告别 Excel 采购台账。',               'SUPPLY_CHAIN', 599.00,  5990.00, 24999.00, 14, 202, 0, 1, 'PUBLISHED', '采购订单,收货确认,应付账款,缺料预警,仓库联动')
ON DUPLICATE KEY UPDATE
  app_name      = VALUES(app_name),
  app_icon      = VALUES(app_icon),
  app_desc      = VALUES(app_desc),
  price_monthly = VALUES(price_monthly),
  price_yearly  = VALUES(price_yearly),
  price_once    = VALUES(price_once),
  trial_days    = VALUES(trial_days),
  features      = VALUES(features),
  is_hot        = VALUES(is_hot),
  is_new        = VALUES(is_new),
  status        = VALUES(status);
