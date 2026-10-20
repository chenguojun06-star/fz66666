-- POS 收银台专业化升级：
-- ① t_pos_sale_payment 组合支付明细 —— 一笔单多种方式混收（现金500+微信300），
--    每种方式一行。sale.pay_method 保留「主收款方式」（金额最大的一种）兼容旧报表，
--    交班对账/按方式汇总的**金额真相源**从本表拆分。
-- ② t_pos_wholesale_tier 批发阶梯价 —— 租户级单条配置（满 N 件打 X 折），
--    结算时件数达标自动提示一键应用。留多行能力（唯一键 tenant+min_qty），
--    未来可升级为多档阶梯。
--
-- 幂等：CREATE TABLE IF NOT EXISTS（沿用 V202710160005 约定：
-- 多行字符串套单引号极易出错，能不用 PREPARE 就不用）。

CREATE TABLE IF NOT EXISTS `t_pos_sale_payment` (
  `id`               BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`        BIGINT        NOT NULL COMMENT '租户ID',
  `sale_id`          BIGINT        NOT NULL COMMENT '销售单ID(t_pos_sale.id)',
  `pay_method`       VARCHAR(32)   NOT NULL COMMENT 'CASH/WECHAT/ALIPAY/CARD/CREDIT/MEMBER_BALANCE',
  `amount`           DECIMAL(12,2) NOT NULL COMMENT '该方式实收金额(元)，现金存应收纳金额，找零不入库',
  `channel_trade_no` VARCHAR(128)  NULL COMMENT '渠道交易号(在线渠道对账用)',
  `remark`           VARCHAR(200)  NULL COMMENT '备注(挂账授权人等)',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_sale` (`sale_id`),
  KEY `idx_tenant_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='POS销售单组合支付明细';

CREATE TABLE IF NOT EXISTS `t_pos_wholesale_tier` (
  `id`            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`     BIGINT        NOT NULL COMMENT '租户ID',
  `min_qty`       INT           NOT NULL COMMENT '满多少件可用批发价',
  `discount_rate` DECIMAL(4,2)  NOT NULL COMMENT '折扣率 0.90=九折(作用为整单折扣)',
  `enabled`       TINYINT       NOT NULL DEFAULT 1 COMMENT '1启用/0停用',
  `remark`        VARCHAR(200)  NULL COMMENT '备注',
  `create_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_qty` (`tenant_id`, `min_qty`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='POS批发阶梯价(件数满min_qty整单打discount_rate折)';
