-- 添加订单管理新字段（跟单员、公司、品类、纸样师）
-- 日期: 2026-02-05
-- 说明: 为生产订单添加跟单员、公司、品类、纸样师字段，支持从样衣开发自动带入

ALTER TABLE t_production_order
    ADD COLUMN merchandiser VARCHAR(100) COMMENT '跟单员' AFTER factory_name,
    ADD COLUMN company VARCHAR(200) COMMENT '公司/客户' AFTER merchandiser,
    ADD COLUMN product_category VARCHAR(100) COMMENT '品类' AFTER company,
    ADD COLUMN pattern_maker VARCHAR(100) COMMENT '纸样师' AFTER product_category;

-- 添加索引以提高查询性能
CREATE INDEX idx_production_merchandiser ON t_production_order(merchandiser);
CREATE INDEX idx_production_company ON t_production_order(company);
CREATE INDEX idx_production_category ON t_production_order(product_category);
CREATE INDEX idx_production_pattern_maker ON t_production_order(pattern_maker);
