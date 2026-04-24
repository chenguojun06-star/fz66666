-- ============================================================
-- V20260425003__fix_appstore_role_dict_encoding.sql
-- 修复 t_app_store / t_role / t_dict / t_template_library 表中因字符集连接错误导致的双重编码乱码
-- 根因: 建表初始数据通过 latin1/cp1252 连接写入 utf8mb4 列，
--       UTF-8 多字节被当作 Latin-1 字符存储并再次 UTF-8 编码，
--       导致 "一键导出金蝶KIS" 等中文显示为 "ä¸€é"®å¯¼å‡ºé‡'èš¶KIS"
-- 修复范围: t_app_store 16条(含category统一) + t_role 4条 + t_dict 7条 + t_template_library 10条
-- 幂等性: 使用 app_code / role_code / dict_code / template_key 作为 WHERE 条件，重复执行安全
-- ============================================================

-- --------------------------------------------------------
-- 1. 修复 t_app_store 表（16个应用）
--    同时统一 category 为英文 key，与前端映射一致
-- --------------------------------------------------------

-- 5个核心对接应用（category 从 '核心对接' 统一为 'CORE'）
UPDATE t_app_store SET app_name = '下单对接', app_desc = '与客户系统对接，自动同步订单数据，减少人工录入', category = 'CORE', features = '["自动接收客户订单","订单状态同步","订单变更通知","批量导入导出","订单数据校验"]' WHERE app_code = 'ORDER_SYNC';
UPDATE t_app_store SET app_name = '质检反馈', app_desc = '质检结果实时同步，不良品反馈，质量数据分析', category = 'CORE', features = '["质检结果推送","不良品反馈","质检报告生成","质量数据统计","异常预警通知"]' WHERE app_code = 'QUALITY_FEEDBACK';
UPDATE t_app_store SET app_name = '物流对接', app_desc = '物流信息实时同步，发货通知，物流轨迹跟踪', category = 'CORE', features = '["发货信息同步","物流轨迹跟踪","签收状态通知","退货物流对接","批量发货管理"]' WHERE app_code = 'LOGISTICS_SYNC';
UPDATE t_app_store SET app_name = '付款对接', app_desc = '付款信息自动同步，对账管理，结算数据对接', category = 'CORE', features = '["付款信息同步","自动对账","结算数据推送","账单生成","付款状态跟踪"]' WHERE app_code = 'PAYMENT_SYNC';
UPDATE t_app_store SET app_name = '面辅料供应对接', app_desc = '采购单自动同步、库存实时查询、价格自动更新、物流跟踪', category = 'CORE', features = '["采购订单自动推送","供应商库存实时查询","价格自动更新同步","发货物流跟踪","批量采购管理"]' WHERE app_code = 'MATERIAL_SUPPLY';

-- 8个电商平台对接应用
UPDATE t_app_store SET app_name = '淘宝', app_desc = '对接淘宝平台，导入订单、同步库存', features = '["订单导入","库存同步","发货管理"]' WHERE app_code = 'EC_TAOBAO';
UPDATE t_app_store SET app_name = '天猫', app_desc = '对接天猫旗舰店，管理品牌订单与退换货', features = '["订单导入","库存同步","退换货管理"]' WHERE app_code = 'EC_TMALL';
UPDATE t_app_store SET app_name = '京东', app_desc = '对接京东平台，实时同步订单与物流', features = '["订单同步","物流跟踪","库存管理"]' WHERE app_code = 'EC_JD';
UPDATE t_app_store SET app_name = '抖音', app_desc = '对接抖音小店，直播带货订单自动流转', features = '["订单导入","直播订单","物流管理"]' WHERE app_code = 'EC_DOUYIN';
UPDATE t_app_store SET app_name = '拼多多', app_desc = '对接拼多多，批量订单处理与发货', features = '["订单导入","批量发货","库存同步"]' WHERE app_code = 'EC_PINDUODUO';
UPDATE t_app_store SET app_name = '小红书', app_desc = '对接小红书商城，内容种草带来的订单管理', features = '["订单管理","笔记联动","库存同步"]' WHERE app_code = 'EC_XIAOHONGSHU';
UPDATE t_app_store SET app_name = '微信小店', app_desc = '对接微信小店与视频号，私域订单全管理', features = '["订单同步","私域管理","客户管理"]' WHERE app_code = 'EC_WECHAT_SHOP';
UPDATE t_app_store SET app_name = 'Shopify', app_desc = '对接 Shopify 独立站，跨境订单一体化管理', features = '["订单同步","多币种","物流对接"]' WHERE app_code = 'EC_SHOPIFY';

-- 3个独立售卖模块
UPDATE t_app_store SET app_name = '客户管理', app_desc = '客户档案管理、应收账款跟踪、客户查询门户（扫码查进度）。深度整合生产数据，一站式管理您的客户关系与回款。', features = '["客户档案","应收账款","客户查询门户","历史订单汇总","催款提醒"]' WHERE app_code = 'CRM_MODULE';
UPDATE t_app_store SET app_name = '财税对接', app_desc = '一键导出金蝶KIS / 用友T3 格式账目，工资汇总表、物料对账单、发货记录单全覆盖，告别手工录入，3分钟完成月结。', features = '["金蝶KIS导出","用友T3导出","工资汇总","物料对账","发货记录"]' WHERE app_code = 'FINANCE_TAX';
UPDATE t_app_store SET app_name = '供应商采购', app_desc = '采购订单管理、收货确认、应付账款核算，与仓库库存深度联动，自动触发缺料预警，告别 Excel 采购台账。', features = '["采购订单","收货确认","应付账款","缺料预警","仓库联动"]' WHERE app_code = 'PROCUREMENT';

-- --------------------------------------------------------
-- 2. 修复 t_role 表（4个默认角色）
-- --------------------------------------------------------
UPDATE t_role SET role_name = '系统管理员', description = '系统管理员' WHERE role_code = 'admin' AND id = 1;
UPDATE t_role SET role_name = '财务人员', description = '财务人员' WHERE role_code = 'finance' AND id = 2;
UPDATE t_role SET role_name = '生产人员', description = '生产人员' WHERE role_code = 'production' AND id = 3;
UPDATE t_role SET role_name = '普通用户', description = '普通用户' WHERE role_code = 'user' AND id = 4;

-- --------------------------------------------------------
-- 3. 修复 t_dict 表（7个字典项）
-- --------------------------------------------------------
UPDATE t_dict SET dict_label = '女装' WHERE dict_code = 'WOMAN' AND dict_type = 'category';
UPDATE t_dict SET dict_label = '男装' WHERE dict_code = 'MAN' AND dict_type = 'category';
UPDATE t_dict SET dict_label = '童装' WHERE dict_code = 'KID' AND dict_type = 'category';
UPDATE t_dict SET dict_label = '春季' WHERE dict_code = 'SPRING' AND dict_type = 'season';
UPDATE t_dict SET dict_label = '夏季' WHERE dict_code = 'SUMMER' AND dict_type = 'season';
UPDATE t_dict SET dict_label = '秋季' WHERE dict_code = 'AUTUMN' AND dict_type = 'season';
UPDATE t_dict SET dict_label = '冬季' WHERE dict_code = 'WINTER' AND dict_type = 'season';

-- --------------------------------------------------------
-- 4. 修复 t_template_library 表（10个模板的 template_name）
--    template_content 中的 JSON 中文由 TemplateStyleOrchestrator.fixMojibake() 运行时修复
--    此处只修 template_name，因为它是短文本且是用户直接可见的
-- --------------------------------------------------------
UPDATE t_template_library SET template_name = '基础工序' WHERE template_type = 'process' AND template_key = 'basic';
UPDATE t_template_library SET template_name = '针织上衣(常用)' WHERE template_type = 'process' AND template_key = 'knit-top';
UPDATE t_template_library SET template_name = '梭织衬衫(常用)' WHERE template_type = 'process' AND template_key = 'woven-shirt';
UPDATE t_template_library SET template_name = '上衣常规(国际参考)' WHERE template_type = 'size' AND template_key = 'top-basic';
UPDATE t_template_library SET template_name = '裤装常规(国际参考)' WHERE template_type = 'size' AND template_key = 'pants-basic';
UPDATE t_template_library SET template_name = '童装常规(国际参考)' WHERE template_type = 'size' AND template_key = 'kids-basic';
UPDATE t_template_library SET template_name = '通用面辅料模板(市面常用)' WHERE template_type = 'bom' AND template_key = 'market-basic';
UPDATE t_template_library SET template_name = '通用面辅料模板(针织/卫衣)' WHERE template_type = 'bom' AND template_key = 'market-knit';
UPDATE t_template_library SET template_name = '通用面辅料模板(外套/夹克)' WHERE template_type = 'bom' AND template_key = 'market-jacket';
UPDATE t_template_library SET template_name = '默认生产进度' WHERE template_type = 'progress' AND template_key = 'default';
