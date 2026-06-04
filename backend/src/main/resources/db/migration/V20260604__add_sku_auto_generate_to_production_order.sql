-- 大货订单新增 sku_auto_generate 开关
-- 默认 false：系统不自动塞 SKU- 前缀，由用户决定（用户可手动填、批量生成、不需要就留空）
ALTER TABLE `t_production_order`
  ADD COLUMN `sku_auto_generate` TINYINT(1) NOT NULL DEFAULT 0
  COMMENT '是否自动生成 SKU（0=否，由用户掌控；1=是，系统在裁剪/样衣创建时自动生成）'
  AFTER `sku`;
