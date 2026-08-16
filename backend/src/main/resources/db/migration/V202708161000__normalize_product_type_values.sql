-- ============================================================
-- V202708161000 商品类型值标准化：英文枚举 → 中文
-- 背景：商品类型字段改为字典维护（dict_type='product_type'），
--       存量数据 FINISHED/SEMI_FINISHED 统一转中文，与字典词条/前端显示对齐
-- 影响范围：仅 t_style_info.product_type 精确匹配旧值的行
-- 回滚方案：UPDATE t_style_info SET product_type='FINISHED' WHERE product_type='成品';
--           UPDATE t_style_info SET product_type='SEMI_FINISHED' WHERE product_type='半成品';
-- ============================================================
UPDATE t_style_info SET product_type = '成品' WHERE product_type = 'FINISHED';
UPDATE t_style_info SET product_type = '半成品' WHERE product_type = 'SEMI_FINISHED';
