-- ============================================================
-- V20270705001: 回填 t_product_sku.sku_color_image（颜色图片联动修复）
-- 原因：颜色/尺码矩阵上传的图片只写入 t_style_attachment，
--       未同步到 t_product_sku.sku_color_image，导致 SKU 表格图片列不显示。
-- 策略：从 t_style_attachment 中 biz_type='color_image::颜色名' 的记录，
--       按颜色匹配回填到同款号同颜色的 SKU.sku_color_image。
-- 幂等性：只更新 sku_color_image 为 NULL 或空串的 SKU，已存在的值不覆盖。
-- ============================================================

UPDATE t_product_sku s
INNER JOIN (
    SELECT
        a.style_id,
        REPLACE(a.biz_type, 'color_image::', '') AS color,
        a.file_url,
        ROW_NUMBER() OVER (PARTITION BY a.style_id, REPLACE(a.biz_type, 'color_image::', '') ORDER BY a.create_time DESC) AS rn
    FROM t_style_attachment a
    WHERE a.biz_type LIKE 'color_image::%'
      AND a.status = 'active'
      AND a.file_url IS NOT NULL
      AND a.file_url != ''
) latest
ON s.style_id = latest.style_id
   AND s.color = latest.color
   AND latest.rn = 1
SET s.sku_color_image = latest.file_url,
    s.update_time = NOW()
WHERE (s.sku_color_image IS NULL OR s.sku_color_image = '');
