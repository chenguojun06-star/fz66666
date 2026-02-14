SET NAMES utf8mb4;

-- 先查看原始 style_info 的颜色
-- SELECT id, style_no, color FROM t_style_info WHERE id = 62;
-- 结果: 黑色

-- 修复编码错误的数据：删除现有错误记录，重新插入
DELETE FROM t_product_sku WHERE id IN (5, 7, 8, 9, 10);

-- 重新插入正确编码的数据
INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
SELECT CONCAT(si.style_no, '-', si.color, '-', 'S'), 62, si.style_no, si.color, 'S', 40.94, 'ENABLED', 2, NOW(), NOW()
FROM t_style_info si WHERE si.id = 62;

INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
SELECT CONCAT(si.style_no, '-', si.color, '-', 'M'), 62, si.style_no, si.color, 'M', 40.94, 'ENABLED', 0, NOW(), NOW()
FROM t_style_info si WHERE si.id = 62;

INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
SELECT CONCAT(si.style_no, '-', si.color, '-', 'L'), 62, si.style_no, si.color, 'L', 40.94, 'ENABLED', 0, NOW(), NOW()
FROM t_style_info si WHERE si.id = 62;

INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
SELECT CONCAT(si.style_no, '-', si.color, '-', 'XL'), 62, si.style_no, si.color, 'XL', 40.94, 'ENABLED', 0, NOW(), NOW()
FROM t_style_info si WHERE si.id = 62;

INSERT INTO t_product_sku (sku_code, style_id, style_no, color, size, sales_price, status, stock_quantity, create_time, update_time)
SELECT CONCAT(si.style_no, '-', si.color, '-', 'XXL'), 62, si.style_no, si.color, 'XXL', 40.94, 'ENABLED', 0, NOW(), NOW()
FROM t_style_info si WHERE si.id = 62;
