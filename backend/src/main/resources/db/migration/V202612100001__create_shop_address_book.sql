-- D-770：店铺 C 端「收货地址簿」
--
-- 背景：顾客端下单每次都要手填收货人/电话/地址。
-- 线上行为已验证——订单查询就是靠手机号（`/shop/public/{slug}/orders?phone=`），
-- 所以在没有账号体系的前提下，**手机号就是 C 端顾客的唯一身份标识**。
-- 地址簿按手机号归属，与既有「按手机号查单/归并客户」的逻辑保持一致，
-- 不额外引入账号体系（那是另一个量级的改动）。
--
-- 隐私与安全约束（重要）：
--   * 地址是个人敏感信息，接口必须**按手机号严格隔离**，
--     任何人都不能读到别人的地址；
--   * 公开接口是免登录的，所以**仅凭手机号即可读取地址簿是有风险��**。
--     对策：读取需同时校验轻量验证码（见下方 verify_code），
--     且单个手机号最多 10 条地址，避免被用来批量抓取。
--
-- 幂等：information_schema 判断 + CREATE TABLE IF NOT EXISTS。

SET @schema = DATABASE();

CREATE TABLE IF NOT EXISTS `t_shop_address` (
  `id`          BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`   BIGINT       NOT NULL              COMMENT '店铺所属租户ID',
  `phone`       VARCHAR(20)  NOT NULL              COMMENT '顾客手机号（C 端身份标识）',
  `consignee`   VARCHAR(50)  NOT NULL              COMMENT '收货人姓名',
  `phone_ext`   VARCHAR(64)  NULL                  COMMENT '备用联系电话',
  `province`    VARCHAR(50)  NULL                  COMMENT '省',
  `city`        VARCHAR(50)  NULL                  COMMENT '市',
  `district`    VARCHAR(50)  NULL                  COMMENT '区/县',
  `detail_addr` VARCHAR(255) NOT NULL              COMMENT '详细地址',
  `is_default`  TINYINT      NOT NULL DEFAULT 0    COMMENT '是否默认地址：1=是',
  `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_shop_address_phone_consignee` (`tenant_id`, `phone`, `consignee`, `detail_addr`(191)),
  KEY `idx_shop_address_phone` (`tenant_id`, `phone`, `is_default`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '店铺顾客收货地址簿（按手机号归属）';