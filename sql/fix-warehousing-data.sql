SET NAMES utf8mb4;

-- ============================================================
-- 修复 PO20260210002 的入库记录关联菲号
-- ============================================================
-- 菲号列表:
--   7149d73c (黑色-S, #1) → 已关联到 id=8565 (合格)
--   6f29c8f4 (黑色-M, #2) → 分配给 id=a455 (合格, 第1条)
--   e472498e (黑色-L, #3) → 分配给 id=78a9 (合格, 第2条)
--   185ae688 (黑色-XL, #4) → 分配给 id=43b7 (不合格, 第3条)
--   934f81fc (黑色-XXL, #5) → 未入库
-- ============================================================

-- 1. 关联第1条合格记录 → 菲号#2 (M码)
UPDATE t_product_warehousing
SET cutting_bundle_id = '6f29c8f461b18ba8b7ee90e7ab4942fa',
    cutting_bundle_no = 2,
    cutting_bundle_qr_code = (SELECT qr_code FROM t_cutting_bundle WHERE id = '6f29c8f461b18ba8b7ee90e7ab4942fa')
WHERE id = 'a4553da3ce87b28a78ab244dc2c1aa23';

-- 2. 关联第2条合格记录 → 菲号#3 (L码)
UPDATE t_product_warehousing
SET cutting_bundle_id = 'e472498efeede3d6ff434668592d7434',
    cutting_bundle_no = 3,
    cutting_bundle_qr_code = (SELECT qr_code FROM t_cutting_bundle WHERE id = 'e472498efeede3d6ff434668592d7434')
WHERE id = '78a9f3d33226905cd7a65782db5627b1';

-- 3. 关联不合格记录 → 菲号#4 (XL码)
UPDATE t_product_warehousing
SET cutting_bundle_id = '185ae688a565dfccf67ce479fd9f4bbf',
    cutting_bundle_no = 4,
    cutting_bundle_qr_code = (SELECT qr_code FROM t_cutting_bundle WHERE id = '185ae688a565dfccf67ce479fd9f4bbf')
WHERE id = '43b738b367a322fb39edae1ed3e16e37';

-- ============================================================
-- 修复 SKU 库存（之前被双倍计数，现在校正）
-- ============================================================
-- 实际合格入库: S=1件, M=1件, L=1件 (共3件)
-- 当前库存: S=2(错), M=0(错), L=0(错)
-- 校正为正确值:

UPDATE t_product_sku SET stock_quantity = 1 WHERE sku_code = 'HYY20222-黑色-S' AND style_id = 62;
UPDATE t_product_sku SET stock_quantity = 1 WHERE sku_code = 'HYY20222-黑色-M' AND style_id = 62;
UPDATE t_product_sku SET stock_quantity = 1 WHERE sku_code = 'HYY20222-黑色-L' AND style_id = 62;
-- XL 不合格, XXL 未入库 → 保持 0
UPDATE t_product_sku SET stock_quantity = 0 WHERE sku_code = 'HYY20222-黑色-XL' AND style_id = 62;
UPDATE t_product_sku SET stock_quantity = 0 WHERE sku_code = 'HYY20222-黑色-XXL' AND style_id = 62;
