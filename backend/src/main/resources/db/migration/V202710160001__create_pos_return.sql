-- D-816：POS 退货/换货单
--
-- 缺口（核实结论）：现有收银台只有 `cancel-pay`（取消**未支付**的订单），
-- 付了钱的单**退不了**。门店一天卖错一件衣服就没有任何补救路径 ——
-- 这是专业收银台里最硬的缺口。
--
-- 设计：
--   ① 单头 t_pos_return：一笔原销售单对应一张退货单（可多次退，最后一次可部分退）
--   ② 单行 t_pos_return_item：记明退的是哪个 SKU、退几件、单价、退货金额
--   ③ 原路退款只记「待人工退款」：本系统未接支付渠道退款接口，
--      自动标记成功等于假成功（CLAUDE.md 禁止桩实现混入主干），
--      必须由收银员在真实退款后确认。
--
-- 幂等：先查 INFORMATION_SCHEMA 再决定是否 ALTER / CREATE。

SET @schema = DATABASE();

-- ① 单头
SET @t_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                  WHERE TABLE_SCHEMA=@schema AND TABLE_NAME='t_pos_return');
SET @ddl := IF(@t_exists = 0,
'CREATE TABLE `t_pos_return` (
  `id`            VARCHAR(36)  NOT NULL COMMENT ''主键'',
  `tenant_id`     BIGINT       NOT NULL COMMENT ''租户ID'',
  `return_no`     VARCHAR(32)  NOT NULL COMMENT ''退货单号'',
  `sale_no`       VARCHAR(32)  NOT NULL COMMENT ''原销售单号'',
  `sale_id`       BIGINT       NULL COMMENT ''原销售单ID'',
  `customer_id`   VARCHAR(36)  NULL COMMENT ''客户ID'',
  `customer_name` VARCHAR(64)  NULL COMMENT ''客户名称'',
  `customer_phone` VARCHAR(20) NULL COMMENT ''客户手机号'',
  `return_type`   VARCHAR(16)  NOT NULL DEFAULT ''REFUND'' COMMENT ''REFUND仅退款 / RETURN退货退款 / EXCHANGE换货'',
  `exchange_pos_sale_no` VARCHAR(32) NULL COMMENT ''换货生成的新销售单号'',
  `item_count`    INT          NOT NULL DEFAULT 0 COMMENT ''退货总件数'',
  `goods_amount`  DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''退货商品原价合计'',
  `discount_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''随之冲回的优惠'',
  `total_amount`  DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''实际应退金额'',
  `pay_method`    VARCHAR(20)  NULL COMMENT ''原支付方式（据此外路退款）'',
  `refund_status` VARCHAR(20)  NOT NULL DEFAULT ''PENDING'' COMMENT ''PENDING待退款 / REFUNDED已退款'',
  `refunded_amount` DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''已退金额'',
  `refund_time`   DATETIME     NULL COMMENT ''人工确认退款时间'',
  `refund_by`     VARCHAR(64)  NULL COMMENT ''确认退款的操作人'',
  `reason`        VARCHAR(200) NULL COMMENT ''退货原因'',
  `stock_returned` TINYINT     NOT NULL DEFAULT 0 COMMENT ''库存是否已回退'',
  `remark`        VARCHAR(255) NULL COMMENT ''备注'',
  `delete_flag`   TINYINT      NOT NULL DEFAULT 0 COMMENT ''删除标记'',
  `creator_id`    VARCHAR(36)  NULL COMMENT ''创建人ID'',
  `creator_name`  VARCHAR(64)  NULL COMMENT ''创建人姓名'',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间'',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT ''更新时间'',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_return_no` (`tenant_id`, `return_no`),
  KEY `idx_sale_no` (`tenant_id`, `sale_no`),
  KEY `idx_refund_status` (`tenant_id`, `refund_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''POS退货/换货单头''',
'DO 0');
PREPARE st FROM @ddl; EXECUTE st; DEALLOCATE PREPARE st;

-- ② 单行
SET @ti_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
                   WHERE TABLE_SCHEMA=@schema AND TABLE_NAME='t_pos_return_item');
SET @ddl2 := IF(@ti_exists = 0,
'CREATE TABLE `t_pos_return_item` (
  `id`            VARCHAR(36)  NOT NULL COMMENT ''主键'',
  `tenant_id`     BIGINT       NOT NULL COMMENT ''租户ID'',
  `return_id`     VARCHAR(36)  NOT NULL COMMENT ''退货单头ID'',
  `return_no`     VARCHAR(32)  NOT NULL COMMENT ''退货单号'',
  `sale_item_id`  VARCHAR(36)  NULL COMMENT ''原销售单行ID'',
  `sku_id`        BIGINT       NULL COMMENT ''SKU ID'',
  `sku_code`      VARCHAR(64)  NULL COMMENT ''SKU编码'',
  `style_id`      BIGINT       NULL COMMENT ''款式ID'',
  `style_no`      VARCHAR(32)  NULL COMMENT ''款号'',
  `style_name`    VARCHAR(64)  NULL COMMENT ''款名'',
  `color`         VARCHAR(32)  NULL COMMENT ''颜色'',
  `size`          VARCHAR(32)  NULL COMMENT ''尺码'',
  `quantity`      INT          NOT NULL COMMENT ''退货件数'',
  `unit_price`    DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''单价'',
  `amount`        DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT ''该行应退金额'',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT ''创建时间'',
  PRIMARY KEY (`id`),
  KEY `idx_return_id` (`tenant_id`, `return_id`),
  KEY `idx_sale_item` (`tenant_id`, `sale_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''POS退货/换货单行''',
'DO 0');
PREPARE st2 FROM @ddl2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- ③ t_pos_sale 增退货累计列：用于「可退数量 = 已售 - 已退」，
--    不用每次全表 SUM 退货行
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=@schema AND TABLE_NAME='t_pos_sale' AND COLUMN_NAME='returned_count'
);
SET @ddl3 := IF(@col_exists = 0,
  'ALTER TABLE `t_pos_sale` ADD COLUMN `returned_count` INT NOT NULL DEFAULT 0 COMMENT ''累计已退件数''',
  'DO 0');
PREPARE st3 FROM @ddl3; EXECUTE st3; DEALLOCATE PREPARE st3;