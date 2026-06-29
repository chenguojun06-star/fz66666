-- V49__add_tag_price_to_product_sku.sql
-- 为 t_product_sku 表添加吊牌价字段，实现基础信息与 SKU 的价格三角联动
-- 关联字段：StyleInfo.tagPrice ↔ ProductSku.tagPrice（吊牌价）

-- 添加 tag_price 列（decimal(10,2)，默认 NULL）
ALTER TABLE t_product_sku
ADD COLUMN tag_price DECIMAL(10,2) NULL COMMENT '吊牌价' AFTER cost_price;
