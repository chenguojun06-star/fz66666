-- D-513 / P0 平台级电商地基：平台级 C 端消费者账号 + 平台级收货地址簿 + 订单绑定账号。
--
-- 背景：D-763 的一期是「每租户一个独立店铺、C 端免登录、按手机号归集」。
-- 现在要把电商模块升级为**平台级公共商城**：所有租户都在平台上架商品，
-- C 端用户注册一个**平台账号**（跨店通用），一单仍只含一个店铺（资金各租户直收，平台不抽成）。
--
-- 设计取舍：
--   1) 账号表**不带 tenant_id** —— 它就是平台级的，一人一号、跨店复用；
--      下单时仍按店铺归属写 t_shop_order.tenant_id（钱与货各归各店）。
--   2) 地址簿同样平台级（t_shop_consumer_address），一个地址可在所有店铺下单时复用；
--      旧的 t_shop_address（租户+手机号）保持不动，免登录下单链路完全不受影响。
--   3) t_shop_order 加 consumer_id：登录用户可在「我的订单」跨店查看自己的订单；
--      未登录下单时该列为 NULL，行为与现在一致。

CREATE TABLE IF NOT EXISTS t_shop_consumer (
  id varchar(36) NOT NULL,
  phone varchar(32) NOT NULL COMMENT '登录手机号（平台唯一，一人一号）',
  password_hash varchar(128) DEFAULT NULL COMMENT 'BCrypt 密码哈希',
  nickname varchar(64) DEFAULT NULL COMMENT '昵称（默认取手机号后四位）',
  avatar varchar(512) DEFAULT NULL COMMENT '头像URL',
  status tinyint DEFAULT 1 COMMENT '1=正常 0=禁用',
  last_login_time datetime DEFAULT NULL,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台级C端消费者账号（跨租户，一人一号）';

CREATE TABLE IF NOT EXISTS t_shop_consumer_address (
  id varchar(36) NOT NULL,
  consumer_id varchar(36) NOT NULL COMMENT '所属平台消费者',
  consignee varchar(50) NOT NULL COMMENT '收货人',
  phone varchar(32) NOT NULL COMMENT '收货电话',
  province varchar(50) DEFAULT NULL,
  city varchar(50) DEFAULT NULL,
  district varchar(50) DEFAULT NULL,
  detail_addr varchar(255) NOT NULL COMMENT '详细地址',
  is_default tinyint DEFAULT 0 COMMENT '1=默认地址（每人最多一个）',
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_consumer (consumer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台级C端收货地址簿（跨店复用）';

-- t_shop_order 加 consumer_id（幂等：MySQL 无 ADD COLUMN IF NOT EXISTS）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_shop_order'
               AND COLUMN_NAME  = 'consumer_id') = 0,
    'ALTER TABLE `t_shop_order` ADD COLUMN `consumer_id` VARCHAR(36) DEFAULT NULL COMMENT ''P0:平台消费者ID（未登录下单为NULL）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_shop_order'
               AND INDEX_NAME   = 'idx_shop_order_consumer') = 0,
    'ALTER TABLE `t_shop_order` ADD INDEX `idx_shop_order_consumer` (`consumer_id`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
