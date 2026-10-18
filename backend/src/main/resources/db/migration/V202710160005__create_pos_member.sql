-- D-817：收银台会员（会员价 / 储值 / 消费记录）
--
-- 设计取舍：
-- ① **不新建客户档案**，会员挂在 t_customer 上（customerId + 手机号）。
--    客户资料只有一份，否则会员和客户两套电话、两套地址，对不上账。
-- ② 会员价用**折扣率**（0.9 = 九折），不存"会员价"这种会过期的快照字段。
--    存死价格就意味着每次调价要批量改会员数据，改不完也追不回来。
-- ③ 储值余额**不放在会员表上**：余额是并发热点，
--    所有变更走流水表 + 原子扣减（见 MemberOrchestrator），避免超扣。
--
-- 幂等：CREATE TABLE IF NOT EXISTS（V202710160003 教训：
-- 多行字符串套单引号极易出错，能不用 PREPARE 就不用）。

CREATE TABLE IF NOT EXISTS `t_pos_member` (
  `id`               VARCHAR(36)   NOT NULL COMMENT '主键',
  `tenant_id`        BIGINT        NOT NULL COMMENT '租户ID',
  `customer_id`      VARCHAR(36)   NULL COMMENT '关联客户ID(t_customer.id)',
  `phone`            VARCHAR(32)   NOT NULL COMMENT '会员手机号(收银台识别依据)',
  `member_no`        VARCHAR(32)   NOT NULL COMMENT '会员号',
  `name`             VARCHAR(64)   NULL COMMENT '会员姓名',
  `level_code`       VARCHAR(32)   NOT NULL DEFAULT 'NORMAL' COMMENT '会员等级编码',
  `discount_rate`    DECIMAL(4,2)  NOT NULL DEFAULT 1.00 COMMENT '折扣率 1.00=不打折 0.90=九折',
  `balance`          DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '储值余额(元)',
  `total_recharge`   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '累计充值',
  `total_spend`      DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '累计消费',
  `points`           INT           NOT NULL DEFAULT 0 COMMENT '积分',
  `status`           VARCHAR(16)   NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE正常/FROZEN冻结',
  `remark`           VARCHAR(200)  NULL COMMENT '备注',
  `creator_id`       VARCHAR(36)   NULL COMMENT '创建人ID',
  `creator_name`     VARCHAR(64)   NULL COMMENT '创建人姓名',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_phone` (`tenant_id`, `phone`),
  UNIQUE KEY `uk_tenant_member_no` (`tenant_id`, `member_no`),
  KEY `idx_customer` (`tenant_id`, `customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='POS会员档案';

CREATE TABLE IF NOT EXISTS `t_pos_member_tx` (
  `id`             VARCHAR(36)    NOT NULL COMMENT '主键',
  `tenant_id`      BIGINT         NOT NULL COMMENT '租户ID',
  `member_id`      VARCHAR(36)    NOT NULL COMMENT '会员ID',
  `type`           VARCHAR(16)    NOT NULL COMMENT 'RECHARGE充值/CONSUME消费/REFUND退款/ADJUST调整',
  `amount`         DECIMAL(12,2)  NOT NULL COMMENT '变动金额(消费/退款为正,退款为负按type语义)',
  `balance_after`  DECIMAL(12,2)  NOT NULL COMMENT '变动后余额(对账唯一依据)',
  `sale_no`        VARCHAR(64)    NULL COMMENT '关联销售单号',
  `biz_no`         VARCHAR(64)    NULL COMMENT '业务流水号(充值单号等)',
  `operator_id`    VARCHAR(36)    NULL COMMENT '操作人ID',
  `operator_name`  VARCHAR(64)    NULL COMMENT '操作人姓名',
  `remark`         VARCHAR(200)   NULL COMMENT '备注/事由',
  `create_time`    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_member_time` (`tenant_id`, `member_id`, `create_time`),
  KEY `idx_sale_no` (`tenant_id`, `sale_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='POS会员储值与消费流水';