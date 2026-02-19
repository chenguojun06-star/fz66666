ALTER TABLE t_product_sku ADD COLUMN stock_quantity INT DEFAULT 0 COMMENT '库存数量';
CREATE INDEX idx_sku_code ON t_product_sku (sku_code);
