-- D-836 扫码通：SKU 机读码（barcode）存量回填
--
-- 背景：barcode 字段天生给扫码用，但历史上两处漏：
--   ① 自动生成 SKU 从不赋值 → 全库大量 NULL；
--   ② 编辑保存时 setBarcode(skuUpdate.getBarcode()) 把已有值抹成 NULL。
-- 而合格证打的是 CODE128 一维条码（原生只编码 ASCII），skuCode 含中文颜色
-- 无法直接入码 → 机读码独立用纯 ASCII 规则：SKU + 主键补 6 位。
--
-- 规则与后端 ProductSkuServiceImpl.scanBarcode() 完全一致：
--   显式填了 barcode 的（商家自编码）尊重不动；空值才回填 SKU 码。
-- 主键不变 → 码终身稳定，不随改色/改尺码变化（不出现"货没换码换了"）。
--
-- 幂等：WHERE barcode IS NULL OR barcode = ''，重复执行安全。

UPDATE t_product_sku
SET barcode = CONCAT('SKU', LPAD(id, 6, '0'))
WHERE barcode IS NULL OR barcode = '';
