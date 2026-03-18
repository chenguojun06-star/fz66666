-- V20260318001: 修复 t_app_store.features 字段 — 将逗号分隔文本转换为合法 JSON 数组
-- 根因：V20260310/V20260315 迁移脚本中 features 写的是逗号分隔文本，
--       AppStoreService.parseJsonFields() 尝试 JSON 反序列化时失败，
--       导致每次调用 listWithJson() 产生 11 条 ERROR 日志
-- 幂等性：WHERE features NOT LIKE '[%' 确保只更新尚未修正的记录

-- 电商平台对接类（来自 V20260310）
UPDATE t_app_store SET features = '["订单导入","库存同步","发货管理"]'
  WHERE app_code = 'EC_TAOBAO'      AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["订单导入","库存同步","退换货管理"]'
  WHERE app_code = 'EC_TMALL'       AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["订单同步","物流跟踪","库存管理"]'
  WHERE app_code = 'EC_JD'          AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["订单导入","直播订单","物流管理"]'
  WHERE app_code = 'EC_DOUYIN'      AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["订单导入","批量发货","库存同步"]'
  WHERE app_code = 'EC_PINDUODUO'   AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["订单管理","笔记联动","库存同步"]'
  WHERE app_code = 'EC_XIAOHONGSHU' AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["订单同步","私域管理","客户管理"]'
  WHERE app_code = 'EC_WECHAT_SHOP' AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["订单同步","多币种","物流对接"]'
  WHERE app_code = 'EC_SHOPIFY'     AND features NOT LIKE '[%';

-- 独立售卖模块（来自 V20260315）
UPDATE t_app_store SET features = '["客户档案","应收账款","客户查询门户","历史订单汇总","催款提醒"]'
  WHERE app_code = 'CRM_MODULE'     AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["金蝶KIS导出","用友T3导出","工资汇总","物料对账","发货记录"]'
  WHERE app_code = 'FINANCE_TAX'    AND features NOT LIKE '[%';

UPDATE t_app_store SET features = '["采购订单","收货确认","应付账款","缺料预警","仓库联动"]'
  WHERE app_code = 'PROCUREMENT'    AND features NOT LIKE '[%';
