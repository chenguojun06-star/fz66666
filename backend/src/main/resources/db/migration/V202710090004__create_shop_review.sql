-- P2 平台级电商：C 端商品评价。
--
-- 设计取舍：
--   1) 粒度 = **一单一款一条**（order_id + style_no 唯一）。一个订单可能含多款，
--      评价必须落到「商品」上才能在商品页展示；落到订单上则无法回答「这款好不好」。
--   2) 只允许「已发货」订单评价，且**一条不可改**（先提交后不可编辑）——
--      避免刷分/改分，也让商家有稳定的口碑数据。重复提交直接报错。
--   3) anonymous=1 时展示端用「匿名用户」，昵称由查询侧拼接（不存冗余昵称）。
--   4) 本表**带 tenant_id**：评价是租户业务数据，商家查自己店铺的评价时必须走
--      既有租户隔离；只有平台侧聚合（按 style_id 求均分）在公开链路里跨租户读取。

CREATE TABLE IF NOT EXISTS t_shop_review (
  id varchar(36) NOT NULL,
  order_id varchar(36) NOT NULL,
  order_no varchar(40) NOT NULL,
  tenant_id bigint NOT NULL COMMENT '商品所属店铺租户',
  consumer_id varchar(36) NOT NULL,
  style_id bigint DEFAULT NULL,
  style_no varchar(64) DEFAULT NULL COMMENT '款式编号（评价落点）',
  sku_id bigint DEFAULT NULL,
  rating tinyint NOT NULL COMMENT '1~5 星',
  content varchar(500) DEFAULT NULL,
  anonymous tinyint DEFAULT 0 COMMENT '1=匿名展示',
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_style (order_id, style_no),
  KEY idx_style (style_id),
  KEY idx_tenant (tenant_id),
  KEY idx_consumer (consumer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='C端商品评价（一单一款一条）';
