-- V6: 补全生产订单表SKU相关字段
-- 创建时间: 2026-01-23
-- 说明: 补全 t_production_order 表中缺失的 color, size, order_details 字段

ALTER TABLE t_production_order
ADD COLUMN IF NOT EXISTS color VARCHAR(100) COMMENT '颜色(多色以逗号分隔)',
ADD COLUMN IF NOT EXISTS size VARCHAR(100) COMMENT '尺码(多码以逗号分隔)',
ADD COLUMN IF NOT EXISTS order_details TEXT COMMENT '订单SKU明细(JSON格式)';
