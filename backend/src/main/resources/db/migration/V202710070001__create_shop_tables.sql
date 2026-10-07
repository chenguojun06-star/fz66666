-- D-763：C端零售店铺一期——数据模型
-- 店铺配置（每租户一个 slug 门面）、店铺订单（C端下单→出库→应收 全链），
-- 款式加「上架到店铺」开关。零售价沿用 SKU 的 sales_price（商品资料维护），不另设价格字段。

CREATE TABLE IF NOT EXISTS t_shop_config (
  id varchar(36) NOT NULL,
  tenant_id bigint NOT NULL COMMENT '所属租户',
  slug varchar(64) NOT NULL COMMENT '店铺访问标识（URL 用，全局唯一）',
  shop_name varchar(128) NOT NULL COMMENT '店铺名称',
  notice varchar(512) DEFAULT NULL COMMENT '店铺公告',
  enabled tinyint DEFAULT 1 COMMENT '1=营业中 0=已打烊（打烊拒绝下单）',
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant (tenant_id),
  UNIQUE KEY uk_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='C端店铺配置';

CREATE TABLE IF NOT EXISTS t_shop_order (
  id varchar(36) NOT NULL,
  tenant_id bigint NOT NULL,
  order_no varchar(40) NOT NULL COMMENT '店铺订单号 SH+时间戳',
  customer_id varchar(64) DEFAULT NULL COMMENT '按手机号归并的 CRM 客户ID',
  customer_name varchar(128) NOT NULL COMMENT '收货人',
  phone varchar(32) NOT NULL COMMENT '联系电话（客户归并键）',
  address varchar(512) NOT NULL COMMENT '收货地址',
  total_amount decimal(12,2) NOT NULL COMMENT '订单总额（服务端按SKU售价计算）',
  item_count int NOT NULL DEFAULT 0 COMMENT '总件数',
  status varchar(20) NOT NULL DEFAULT 'PENDING_SHIP' COMMENT 'PENDING_SHIP待发货/SHIPPED已发货/CANCELLED已取消',
  receivable_id varchar(64) DEFAULT NULL COMMENT '挂账应收单ID（收款走收付款中心）',
  outstock_no varchar(64) DEFAULT NULL COMMENT '销售出库单号（首个，多款时为逗号拼接备注）',
  remark varchar(512) DEFAULT NULL COMMENT '买家留言',
  delete_flag tinyint DEFAULT 0,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_order_no (order_no),
  KEY idx_tenant_phone (tenant_id, phone),
  KEY idx_tenant_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='C端店铺订单';

CREATE TABLE IF NOT EXISTS t_shop_order_item (
  id varchar(36) NOT NULL,
  order_id varchar(36) NOT NULL,
  tenant_id bigint NOT NULL,
  sku_id bigint NOT NULL,
  sku_code varchar(64) NOT NULL,
  style_no varchar(64) DEFAULT NULL,
  style_name varchar(128) DEFAULT NULL,
  color varchar(64) DEFAULT NULL,
  size varchar(64) DEFAULT NULL,
  unit_price decimal(12,2) NOT NULL COMMENT '成交单价（服务端取SKU售价，不信前端）',
  quantity int NOT NULL,
  amount decimal(12,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='C端店铺订单明细';

-- 款式上架开关：仅上架款式在店铺可见（价格/库存永远以服务端为准）
-- 幂等：先查 information_schema 再决定是否 ADD COLUMN（V202709200001 同款写法，MySQL 无 IF NOT EXISTS）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_style_info'
               AND COLUMN_NAME  = 'shop_listed') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `shop_listed` TINYINT DEFAULT 0 COMMENT ''D-763:是否上架C端店铺''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_style_info'
               AND COLUMN_NAME  = 'shop_listing_time') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `shop_listing_time` DATETIME DEFAULT NULL COMMENT ''D-763:上架时间''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
