-- P1 平台级电商：跨店购物车。
--
-- 设计取舍：
--   1) 购物车挂在**平台消费者**下（consumer_id），而不是 (tenant_id, phone)——
--      这样同一辆车里能同时放不同店铺的商品，才是「平台商城」的体验。
--   2) 仍冗余一列 tenant_id（= 该商品所属店铺租户），用于「按店铺分组结算」。
--      结算时逐店铺调用既有 placeOrder（各自独立事务），因此**一张订单仍只含一个店铺**，
--      资金与货权不跨店。
--   3) (consumer_id, sku_id) 唯一：重复加购走「累加数量」而不是插两条，
--      避免购物车里出现同一 SKU 两行、结算时重复扣库存。

CREATE TABLE IF NOT EXISTS t_shop_cart_item (
  id varchar(36) NOT NULL,
  consumer_id varchar(36) NOT NULL COMMENT '所属平台消费者',
  tenant_id bigint NOT NULL COMMENT '商品所属店铺租户（结算分组键）',
  sku_id bigint NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_consumer_sku (consumer_id, sku_id),
  KEY idx_consumer (consumer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台级C端购物车（跨店，一人一车）';
