-- D-817：收银台交接班 / 钱箱
--
-- 为什么必须有：原先只有「今日汇总」（不分收银员、不分班次、不锁钱箱）。
-- 多店员场景下会出现「钱对不上、不知道谁经手、交完班还能继续改数」，
-- 这是零售收银的防损基本盘，也是交班时唯一能对清账的依据。
--
-- 钱箱口径（刻意保守，宁可少算不可算错）：
--   只有 CASH 进钱箱。
--   WECHAT / ALIPAY 是线上收到商户账户，不进钱箱；
--   CARD 走 POS 机对账单，不进钱箱；
--   CREDIT 是挂账，根本不是收款，不能算进「本班收款」。
--
-- 差异：应有钱 = 期初备用金 + 本班现金收款 − 本班现金退款
--        差异   = 实点现金 − 应有钱（长款正 / 短款负）
--
-- 幂等：用 CREATE TABLE IF NOT EXISTS。
-- 本文件第一版用 PREPARE + INFORMATION_SCHEMA 的引号套引号写法，
-- 结果因为每行结尾多一个单引号导致整份脚本语法错误（线上已发生一次，
-- Flyway 报 failed 且表没建）。多行字符串套单引号极易出错，
-- 建表直接用 IF NOT EXISTS 更短也更不容易错 —— 幂等性等价。

CREATE TABLE IF NOT EXISTS `t_pos_shift` (
  `id`               VARCHAR(36)   NOT NULL COMMENT '主键',
  `tenant_id`        BIGINT        NOT NULL COMMENT '租户ID',
  `shift_no`         VARCHAR(32)   NOT NULL COMMENT '班次号',
  `cashier_id`       VARCHAR(36)   NOT NULL COMMENT '收银员ID',
  `cashier_name`     VARCHAR(64)   NOT NULL COMMENT '收银员姓名',
  `terminal`         VARCHAR(64)   NULL COMMENT '收银台/终端标识',
  `opening_cash`     DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '开班备用金(钱箱初始金额)',
  `sale_count`       INT           NOT NULL DEFAULT 0 COMMENT '本班订单数',
  `sale_item_count`  INT           NOT NULL DEFAULT 0 COMMENT '本班件数',
  `cash_sale_amount`   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本班现金收款',
  `online_sale_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本班线上收款(微信/支付宝)',
  `card_sale_amount`   DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本班刷卡金额',
  `credit_amount`      DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本班挂账金额',
  `refund_cash_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本班现金退款',
  `expected_cash`    DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '应有钱箱金额',
  `actual_cash`      DECIMAL(12,2) NULL COMMENT '实点现金(交班时填写)',
  `diff_amount`      DECIMAL(12,2) NULL COMMENT '差异: 实点减应有(长款正/短款负)',
  `diff_reason`      VARCHAR(200)  NULL COMMENT '差异原因',
  `status`           VARCHAR(16)   NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN上班中 / CLOSED已交班',
  `opened_at`        DATETIME      NOT NULL COMMENT '开班时间',
  `closed_at`        DATETIME      NULL COMMENT '交班时间',
  `remark`           VARCHAR(200)  NULL COMMENT '备注',
  `creator_id`       VARCHAR(36)   NULL COMMENT '开班人ID',
  `creator_name`     VARCHAR(64)   NULL COMMENT '开班人姓名',
  `create_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_shift_no` (`tenant_id`, `shift_no`),
  KEY `idx_cashier_status` (`tenant_id`, `cashier_id`, `status`),
  KEY `idx_opened_at` (`tenant_id`, `opened_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='POS交接班/钱箱';
