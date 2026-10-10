-- 收银台（POS 开单）
--
-- 背景（用户诉求）：「有的客户需要这种收银台类似的客户端」。
-- 系统里该有的都有了（商品/SKU、成品库存、出库台账、应收账款、收付款中心、客户档案），
-- 缺的只是「一屏完成选货 → 改价 → 收款」的开单单据。本表就是那张单据。
--
-- 口径（与既有模块保持一致，不另起一套）：
--   ① 一张 POS 单 = 一次出库（走既有 freeOutbound，库存与台账口径与店铺订单一致）
--      + 一次收款（现金/微信/支付宝/刷卡）**或** 一条应收（挂账，进收付款中心核销）；
--   ② 收款方式只**登记**，不接真实支付通道 —— 零牌照风险、立刻能用；
--   ③ 挂账（pay_method=CREDIT）才生成应收，当场收钱的不生成应收，
--      否则同一笔钱会在「已收款」和「应收未收」里各出现一次。
--
-- 幂等：CREATE TABLE IF NOT EXISTS。

SET @schema = DATABASE();

CREATE TABLE IF NOT EXISTS `t_pos_sale` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT,
  `tenant_id`       BIGINT        NOT NULL             COMMENT '所属租户',
  `sale_no`         VARCHAR(32)   NOT NULL             COMMENT '销售单号 POS+时间戳+序号',
  `customer_id`     VARCHAR(36)   NULL                 COMMENT 'CRM 客户ID（按手机号归并，可空=散客）',
  `customer_name`   VARCHAR(64)   NULL                 COMMENT '客户名称/姓名',
  `customer_phone`  VARCHAR(32)   NULL                 COMMENT '联系电话（挂账时用于归并客户）',
  `item_count`      INT           NOT NULL DEFAULT 0   COMMENT '总件数',
  `goods_amount`    DECIMAL(14,2) NOT NULL DEFAULT 0   COMMENT '商品金额（折前）',
  `discount_amount` DECIMAL(14,2) NOT NULL DEFAULT 0   COMMENT '整单折扣金额',
  `round_off_amount` DECIMAL(14,2) NOT NULL DEFAULT 0  COMMENT '抹零金额（正数=少收）',
  `total_amount`    DECIMAL(14,2) NOT NULL DEFAULT 0   COMMENT '应收金额 = 商品金额 - 折扣 - 抹零',
  `pay_method`      VARCHAR(20)   NOT NULL             COMMENT 'CASH/WECHAT/ALIPAY/CARD/CREDIT(挂账)',
  `pay_status`      VARCHAR(20)   NOT NULL             COMMENT 'PAID 已收款 / UNPAID 挂账未收',
  `receivable_id`   VARCHAR(36)   NULL                 COMMENT '挂账生成的应收单ID（当场收款为空）',
  `outstock_no`     VARCHAR(255)  NULL                 COMMENT '出库单号（多款时存首单号+等N单）',
  `remark`          VARCHAR(255)  NULL                 COMMENT '备注',
  `cashier`         VARCHAR(64)   NULL                 COMMENT '收银员（登录名）',
  `status`          VARCHAR(20)   NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL / VOIDED（作废留痕不删）',
  `create_time`     DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `update_time`     DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_pos_sale_no` (`sale_no`),
  KEY `idx_pos_tenant_time` (`tenant_id`, `create_time`),
  KEY `idx_pos_customer` (`tenant_id`, `customer_phone`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '收银台销售单（POS 开单）';

CREATE TABLE IF NOT EXISTS `t_pos_sale_item` (
  `id`          BIGINT        NOT NULL AUTO_INCREMENT,
  `tenant_id`   BIGINT        NOT NULL,
  `sale_id`     BIGINT        NOT NULL             COMMENT '销售单ID',
  `sku_id`      BIGINT        NULL                 COMMENT 'SKU ID',
  `sku_code`    VARCHAR(64)   NULL,
  `style_no`    VARCHAR(64)   NULL,
  `style_name`  VARCHAR(255)  NULL,
  `color`       VARCHAR(64)   NULL,
  `size`        VARCHAR(64)   NULL,
  `tag_price`   DECIMAL(14,2) NULL                 COMMENT '吊牌价（展示用，便于对账）',
  `unit_price`  DECIMAL(14,2) NOT NULL DEFAULT 0   COMMENT '成交单价（可改价，留痕）',
  `quantity`    INT           NOT NULL DEFAULT 1,
  `amount`      DECIMAL(14,2) NOT NULL DEFAULT 0   COMMENT '小计 = 单价 × 数量',
  `create_time` DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pos_item_sale` (`sale_id`),
  KEY `idx_pos_item_sku` (`tenant_id`, `sku_id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci
  COMMENT = '收银台销售单明细';
