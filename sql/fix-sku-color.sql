-- 修复 style_id=62 (HYY20222) 的 SKU 颜色数据
-- 正确颜色: 黑色 (从 t_style_info 确认)

-- 修复 id=5 的颜色
UPDATE t_product_sku SET color = '黑色', sku_code = 'HYY20222-黑色-S' WHERE id = 5;

-- 删除 id=6 (重复的 白色-M，来自之前错误插入)
DELETE FROM t_product_sku WHERE id = 6;

-- 修复 id=7-10 的颜色 (从 white 改为 黑色)
UPDATE t_product_sku SET color = '黑色', sku_code = 'HYY20222-黑色-M' WHERE id = 7;
UPDATE t_product_sku SET color = '黑色', sku_code = 'HYY20222-黑色-L' WHERE id = 8;
UPDATE t_product_sku SET color = '黑色', sku_code = 'HYY20222-黑色-XL' WHERE id = 9;
UPDATE t_product_sku SET color = '黑色', sku_code = 'HYY20222-黑色-XXL' WHERE id = 10;
