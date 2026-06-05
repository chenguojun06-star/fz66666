ALTER TABLE t_product_outstock ADD COLUMN IF NOT EXISTS price_adjustment_reason VARCHAR(500) COMMENT '价格调整原因';
ALTER TABLE t_product_outstock ADD COLUMN IF NOT EXISTS original_sales_price DECIMAL(12,2) COMMENT '原始销售价（调整前）';
