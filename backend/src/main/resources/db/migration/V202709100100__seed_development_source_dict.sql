-- D-344 开发来源词典（样衣开发详情页"开发来源"字段选项，齿轮可继续维护）
-- 幂等：INSERT IGNORE + 唯一键（dict_code/dict_type）
INSERT IGNORE INTO t_dict (dict_code, dict_label, dict_value, dict_type, sort, status) VALUES
('SELF_DEVELOPED', '自主开发', 'SELF_DEVELOPED', 'development_source', 1, 'ENABLED'),
('SELECTION_CENTER', '选品中心', 'SELECTION_CENTER', 'development_source', 2, 'ENABLED'),
('CUSTOMER_PROVIDED', '客户提供', 'CUSTOMER_PROVIDED', 'development_source', 3, 'ENABLED'),
('MARKET_SAMPLING', '市场采样', 'MARKET_SAMPLING', 'development_source', 4, 'ENABLED');
