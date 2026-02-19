-- 修复 t_product_sku 中的组合尺码脏数据
-- id=4: size='S,M,L,XL,XXL' -> 拆分为独立行

-- 插入 M
INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
VALUES ('HYY20222-white-M', 62, 'HYY20222', 'white', 'M', 40.94, 'ENABLED', 0, NOW(), NOW());

-- 插入 L
INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
VALUES ('HYY20222-white-L', 62, 'HYY20222', 'white', 'L', 40.94, 'ENABLED', 0, NOW(), NOW());

-- 插入 XL
INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
VALUES ('HYY20222-white-XL', 62, 'HYY20222', 'white', 'XL', 40.94, 'ENABLED', 0, NOW(), NOW());

-- 插入 XXL
INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
VALUES ('HYY20222-white-XXL', 62, 'HYY20222', 'white', 'XXL', 40.94, 'ENABLED', 0, NOW(), NOW());

-- 删除组合尺码的脏数据记录
DELETE FROM t_product_sku WHERE id = 4;
