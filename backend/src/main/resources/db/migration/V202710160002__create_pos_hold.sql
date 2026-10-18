-- D-817：收银台挂单（暂存购物车）
--
-- 为什么必须有：顾客临时离开（去试衣间、接电话、去拿发票）时，购物车不能丢。
-- 这是零售收银最高频的操作之一，现有收银台没有 —— 只能干等或手工在纸上记。
--
-- 为什么用 JSON 快照而不是单头+单行两张表：
--   挂单是**临时暂存的工作区**，不是财务单据 —— 它不进任何账、不产生应收、
--   不参与统计。取回时只需把快照还原成购物车。为此建两张表 + 一套增删改查，
--   会让「暂存」和「单据」在同一个模型里混在一起，日后统计口径必然被污染。
--   真单据请走 t_pos_sale（有完整金额、支付、出库、台账）。
--
-- 幂等：先查 INFORMATION_SCHEMA 再决定是否 CREATE。

SET @schema = DATABASE();

SET @t_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                  WHERE TABLE_SCHEMA=@schema AND TABLE_NAME='t_pos_hold');
SET @ddl := IF(@t_exists = 0,
'CREATE TABLE `t_pos_hold` (
  `id`          VARCHAR(36)  NOT NULL COMMENT ''主键'',
  `tenant_id`   BIGINT       NOT NULL COMMENT ''租户ID'',
  `hold_no`     VARCHAR(32)  NOT NULL COMMENT ''挂单号'',
  `customer_id` VARCHAR(36)  NULL COMMENT ''客户ID'',
  `customer_name` VARCHAR(64) NULL COMMENT ''客户名称'',
  `customer_phone` VARCHAR(20) NULL COMMENT ''客户手机号'',
  `cart_json`   TEXT         NOT NULL COMMENT ''购物车快照(JSON数组)：行/数量/单价/折扣'',
  `item_count`  INT          NOT NULL DEFAULT 0 COMMENT ''件数'',
  `goods_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''商品原价合计'',
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''整单优惠'',
  `pay_method`  VARCHAR(20)  NULL COMMENT ''预选支付方式（取回后保留，省一次点击）'',
  `remark`      VARCHAR(120) NULL COMMENT ''备注（如「顾客去试衣间」）'',
  `status`      VARCHAR(16)  NOT NULL DEFAULT ''HELD'' COMMENT ''HELD挂起中 / RESUMED已取回 / DISCARDED已丢弃'',
  `resumed_time` DATETIME    NULL COMMENT ''取回时间'',
  `creator_id`  VARCHAR(36)  NULL COMMENT ''挂起人ID'',
  `creator_name` VARCHAR(64) NULL COMMENT ''挂起人姓名'',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''挂起时间'',
  `update_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间'',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_hold_no` (`tenant_id`, `hold_no`),
  KEY `idx_status` (`tenant_id`, `status`),
  KEY `idx_create_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''收银台挂单（暂存工作区，不参与财务口径）''',
'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;