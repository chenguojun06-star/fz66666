-- ======================================================================
-- V20260221b: 合并所有遗漏迁移 (永久修复)
-- 说明: 此文件将 backend/sql/ 下从未被 Flyway 执行的 12 个 SQL 文件
--       统一纳入迁移管理，所有语句均已做幂等处理。
-- 涵盖文件:
--   V20260205__audit_and_version.sql        (t_operation_log + version列)
--   V20260205b__sample_stock_version.sql    (t_sample_stock version列)
--   V20260206__multi_tenant_saas.sql        (t_tenant + 全表 tenant_id)
--   V20260210__app_store.sql                (应用商店4张表 + 初始数据)
--   V20260210__tenant_app.sql               (t_tenant_app + t_tenant_app_log)
--   V20260210__add_material_supply_app.sql  (面辅料供应对接应用数据)
--   V20260215__finished_settlement_approval_status.sql (成品结算审批表)
--   V20260219__fix_settlement_view_price_and_cancelled.sql (视图修复)
--   V20260219_order_transfer_factory.sql     (订单转工厂字段)
--   V20260219b__material_roll.sql            (料卷/箱管理表)
--   V20260220_factory_type_payment_method.sql (工厂类型 + 支付方式默认值)
--   V20260221__add_user_wechat_openid.sql    (微信openid字段)
-- 最后更新: 2026-02-21
-- ======================================================================

-- ======================================================================
-- Part 1: 审计日志表 + 乐观锁版本字段
-- (来自 V20260205__audit_and_version.sql + V20260205b__sample_stock_version.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_operation_log` (
    `id`           BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id`    BIGINT       DEFAULT NULL COMMENT '租户ID',
    `user_id`      VARCHAR(64)  DEFAULT NULL COMMENT '操作人ID',
    `user_name`    VARCHAR(100) DEFAULT NULL COMMENT '操作人名称',
    `module`       VARCHAR(50)  DEFAULT NULL COMMENT '操作模块',
    `operation`    VARCHAR(100) DEFAULT NULL COMMENT '操作描述',
    `method`       VARCHAR(200) DEFAULT NULL COMMENT '请求方法',
    `params`       TEXT         DEFAULT NULL COMMENT '请求参数',
    `result`       VARCHAR(20)  DEFAULT NULL COMMENT '操作结果: SUCCESS/FAILED',
    `error_msg`    TEXT         DEFAULT NULL COMMENT '错误信息',
    `ip`           VARCHAR(50)  DEFAULT NULL COMMENT '客户端IP',
    `cost_ms`      BIGINT       DEFAULT NULL COMMENT '耗时(毫秒)',
    `create_time`  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='操作审计日志';

-- t_material_stock 乐观锁版本号
ALTER TABLE `t_material_stock`
    ADD COLUMN `version` INT DEFAULT 0
    COMMENT '乐观锁版本号（并发库存操作防覆盖）';

-- t_production_order 乐观锁版本号
ALTER TABLE `t_production_order`
    ADD COLUMN `version` INT DEFAULT 0
    COMMENT '乐观锁版本号';

-- 生产订单索引（ADD COLUMN 后补充）
CREATE INDEX IF NOT EXISTS `idx_created_by_id` ON `t_production_order` (`created_by_id`);
CREATE INDEX IF NOT EXISTS `idx_factory_id`    ON `t_production_order` (`factory_id`);

-- t_sample_stock 乐观锁版本号
ALTER TABLE `t_sample_stock`
    ADD COLUMN `version` INT DEFAULT 0
    COMMENT '乐观锁版本号（并发库存操作防覆盖）';


-- ======================================================================
-- Part 2: 多租户SaaS架构 - t_tenant 表 + 全业务表 tenant_id 字段
-- (来自 V20260206__multi_tenant_saas.sql)
-- 注意: 使用 MySQL 8.0 的 ADD COLUMN 语法代替存储过程
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_tenant` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '租户ID',
    `tenant_name`    VARCHAR(100) NOT NULL COMMENT '租户名称（公司/工厂名）',
    `tenant_code`    VARCHAR(50)  NOT NULL COMMENT '租户编码（唯一标识）',
    `owner_user_id`  BIGINT       DEFAULT NULL COMMENT '租户主账号用户ID',
    `contact_name`   VARCHAR(50)  DEFAULT NULL COMMENT '联系人',
    `contact_phone`  VARCHAR(20)  DEFAULT NULL COMMENT '联系电话',
    `status`         VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    `max_users`      INT          DEFAULT 50 COMMENT '最大用户数限制（0=不限制）',
    `expire_time`    DATETIME     DEFAULT NULL COMMENT '过期时间（null=永不过期）',
    `remark`         VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_time`    DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY `uk_tenant_code` (`tenant_code`),
    KEY `idx_status` (`status`),
    KEY `idx_owner_user_id` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

-- ---- 为 t_user 添加租户相关字段 ----
ALTER TABLE `t_user`
    ADD COLUMN `tenant_id`       BIGINT     DEFAULT NULL COMMENT '所属租户ID',
    ADD COLUMN `is_tenant_owner` TINYINT(1) DEFAULT 0   COMMENT '是否为租户主账号';
CREATE INDEX IF NOT EXISTS `idx_user_tenant_id` ON `t_user` (`tenant_id`);

-- ---- 生产模块 ----
ALTER TABLE `t_production_order`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_po_tenant_id`   ON `t_production_order` (`tenant_id`);

ALTER TABLE `t_production_process_tracking` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_ppt_tenant_id`  ON `t_production_process_tracking` (`tenant_id`);

ALTER TABLE `t_cutting_task`               ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_ct_tenant_id`   ON `t_cutting_task` (`tenant_id`);

ALTER TABLE `t_cutting_bundle`             ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_cb_tenant_id`   ON `t_cutting_bundle` (`tenant_id`);

ALTER TABLE `t_scan_record`                ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sr_tenant_id`   ON `t_scan_record` (`tenant_id`);

ALTER TABLE `t_secondary_process`          ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sp_tenant_id`   ON `t_secondary_process` (`tenant_id`);

-- ---- 款式模块 ----
ALTER TABLE `t_style_info`                 ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_si_tenant_id`   ON `t_style_info` (`tenant_id`);

ALTER TABLE `t_style_bom`                  ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sb_tenant_id`   ON `t_style_bom` (`tenant_id`);

ALTER TABLE `t_style_process`              ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_spr_tenant_id`  ON `t_style_process` (`tenant_id`);

ALTER TABLE `t_style_attachment`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sa_tenant_id`   ON `t_style_attachment` (`tenant_id`);

ALTER TABLE `t_style_size`                 ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_ss_tenant_id`   ON `t_style_size` (`tenant_id`);

ALTER TABLE `t_style_size_price`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_ssp_tenant_id`  ON `t_style_size_price` (`tenant_id`);

ALTER TABLE `t_style_quotation`            ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sq_tenant_id`   ON `t_style_quotation` (`tenant_id`);

ALTER TABLE `t_style_operation_log`        ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sol_tenant_id`  ON `t_style_operation_log` (`tenant_id`);

-- ---- 面辅料/仓库模块 ----
SET @tbl_md = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database');
SET @s = IF(@tbl_md > 0 AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT ''租户ID''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @i_md = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND INDEX_NAME='idx_md_tenant_id');
SET @s = IF(@tbl_md > 0 AND @i_md = 0, 'CREATE INDEX `idx_md_tenant_id` ON `t_material_database` (`tenant_id`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `t_material_stock`             ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_ms_tenant_id`   ON `t_material_stock` (`tenant_id`);

ALTER TABLE `t_material_inbound`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_mi_tenant_id`   ON `t_material_inbound` (`tenant_id`);

ALTER TABLE `t_material_inbound_sequence`  ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_mis_tenant_id`  ON `t_material_inbound_sequence` (`tenant_id`);

ALTER TABLE `t_material_picking`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_mp_tenant_id`   ON `t_material_picking` (`tenant_id`);

ALTER TABLE `t_material_picking_item`      ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_mpi_tenant_id`  ON `t_material_picking_item` (`tenant_id`);

ALTER TABLE `t_material_purchase`          ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_mpu_tenant_id`  ON `t_material_purchase` (`tenant_id`);

-- ---- 成品模块 ----
ALTER TABLE `t_product_sku`                ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_ps_tenant_id`   ON `t_product_sku` (`tenant_id`);

ALTER TABLE `t_product_warehousing`        ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_pw_tenant_id`   ON `t_product_warehousing` (`tenant_id`);

ALTER TABLE `t_product_outstock`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_pos_tenant_id`  ON `t_product_outstock` (`tenant_id`);

-- ---- 样衣模块 ----
ALTER TABLE `t_sample_stock`               ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sst_tenant_id`  ON `t_sample_stock` (`tenant_id`);

ALTER TABLE `t_sample_loan`                ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_sl_tenant_id`   ON `t_sample_loan` (`tenant_id`);

-- ---- 财务模块 ----
ALTER TABLE `t_material_reconciliation`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_mr_tenant_id`   ON `t_material_reconciliation` (`tenant_id`);

ALTER TABLE `t_order_reconciliation_approval`   ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_ora_tenant_id`  ON `t_order_reconciliation_approval` (`tenant_id`);

ALTER TABLE `t_shipment_reconciliation`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_shr_tenant_id`  ON `t_shipment_reconciliation` (`tenant_id`);

ALTER TABLE `t_payroll_settlement`              ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_pse_tenant_id`  ON `t_payroll_settlement` (`tenant_id`);

ALTER TABLE `t_payroll_settlement_item`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_psi_tenant_id`  ON `t_payroll_settlement_item` (`tenant_id`);

ALTER TABLE `t_deduction_item`                  ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_di_tenant_id`   ON `t_deduction_item` (`tenant_id`);

-- ---- 工厂/基础数据 ----
ALTER TABLE `t_factory`                    ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_f_tenant_id`    ON `t_factory` (`tenant_id`);

-- ---- 版型模块 ----
ALTER TABLE `t_pattern_production`         ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_pp_tenant_id`   ON `t_pattern_production` (`tenant_id`);

ALTER TABLE `t_pattern_revision`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_pr_tenant_id`   ON `t_pattern_revision` (`tenant_id`);

-- ---- 模板库 ----
ALTER TABLE `t_template_library`           ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';
CREATE INDEX IF NOT EXISTS `idx_tl_tenant_id`   ON `t_template_library` (`tenant_id`);

ALTER TABLE `t_template_operation_log`     ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID';


-- ======================================================================
-- Part 3: 应用商店系统（4 张表 + 初始应用数据）
-- (来自 V20260210__app_store.sql)
-- ======================================================================

-- 1. 应用商店表
CREATE TABLE IF NOT EXISTS `t_app_store` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `app_code`     VARCHAR(50)   NOT NULL COMMENT '应用编码',
    `app_name`     VARCHAR(100)  NOT NULL COMMENT '应用名称',
    `app_icon`     VARCHAR(200)  DEFAULT NULL COMMENT '应用图标',
    `app_desc`     VARCHAR(500)  DEFAULT NULL COMMENT '应用简介',
    `app_detail`   TEXT          DEFAULT NULL COMMENT '应用详细说明',
    `category`     VARCHAR(50)   DEFAULT NULL COMMENT '应用分类',
    `price_type`   VARCHAR(20)   NOT NULL DEFAULT 'MONTHLY' COMMENT '计费类型: FREE/MONTHLY/YEARLY/ONCE',
    `price_monthly` DECIMAL(10,2) DEFAULT 0.00 COMMENT '月付价格',
    `price_yearly`  DECIMAL(10,2) DEFAULT 0.00 COMMENT '年付价格',
    `price_once`    DECIMAL(10,2) DEFAULT 0.00 COMMENT '买断价格',
    `sort_order`   INT           DEFAULT 0 COMMENT '排序',
    `is_hot`       TINYINT       DEFAULT 0 COMMENT '是否热门',
    `is_new`       TINYINT       DEFAULT 0 COMMENT '是否新应用',
    `status`       VARCHAR(20)   NOT NULL DEFAULT 'PUBLISHED' COMMENT '状态: DRAFT/PUBLISHED/OFFLINE',
    `features`     TEXT          DEFAULT NULL COMMENT '功能列表JSON',
    `screenshots`  TEXT          DEFAULT NULL COMMENT '应用截图JSON',
    `min_users`    INT           DEFAULT 1 COMMENT '最少用户数',
    `max_users`    INT           DEFAULT 999 COMMENT '最大用户数',
    `trial_days`   INT           DEFAULT 0 COMMENT '试用天数',
    `remark`       VARCHAR(500)  DEFAULT NULL COMMENT '备注',
    `create_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag`  TINYINT       DEFAULT 0 COMMENT '逻辑删除',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_code` (`app_code`),
    KEY `idx_category` (`category`),
    KEY `idx_status` (`status`),
    KEY `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用商店-可购买应用列表';

-- 2. 租户订阅表
CREATE TABLE IF NOT EXISTS `t_tenant_subscription` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `subscription_no`  VARCHAR(50)   NOT NULL COMMENT '订阅编号',
    `tenant_id`         BIGINT       NOT NULL COMMENT '租户ID',
    `tenant_name`       VARCHAR(100) DEFAULT NULL COMMENT '租户名称',
    `app_id`            BIGINT       NOT NULL COMMENT '应用ID',
    `app_code`          VARCHAR(50)  NOT NULL COMMENT '应用编码',
    `app_name`          VARCHAR(100) NOT NULL COMMENT '应用名称',
    `subscription_type` VARCHAR(20)  NOT NULL COMMENT '订阅类型: TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `price`             DECIMAL(10,2) DEFAULT 0.00 COMMENT '订阅价格',
    `user_count`        INT          DEFAULT 1 COMMENT '购买用户数',
    `start_time`        DATETIME     NOT NULL COMMENT '生效时间',
    `end_time`          DATETIME     DEFAULT NULL COMMENT '到期时间',
    `status`            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT '状态: TRIAL/ACTIVE/EXPIRED/CANCELED',
    `auto_renew`        TINYINT      DEFAULT 0 COMMENT '是否自动续费',
    `order_id`          BIGINT       DEFAULT NULL COMMENT '关联订单ID',
    `remark`            VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `created_by`        VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    `create_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`       TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_subscription_no` (`subscription_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_end_time` (`end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='租户应用订阅';

-- 3. 应用订单表
CREATE TABLE IF NOT EXISTS `t_app_order` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_no`         VARCHAR(50)  NOT NULL COMMENT '订单号',
    `tenant_id`        BIGINT       NOT NULL COMMENT '租户ID',
    `tenant_name`      VARCHAR(100) DEFAULT NULL,
    `app_id`           BIGINT       NOT NULL COMMENT '应用ID',
    `app_code`         VARCHAR(50)  NOT NULL,
    `app_name`         VARCHAR(100) NOT NULL,
    `order_type`       VARCHAR(20)  NOT NULL COMMENT '订单类型: NEW/RENEW/UPGRADE',
    `subscription_type` VARCHAR(20) NOT NULL COMMENT '订阅类型: TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `user_count`       INT          DEFAULT 1,
    `unit_price`       DECIMAL(10,2) DEFAULT 0.00,
    `total_amount`     DECIMAL(10,2) NOT NULL,
    `discount_amount`  DECIMAL(10,2) DEFAULT 0.00,
    `actual_amount`    DECIMAL(10,2) NOT NULL,
    `status`           VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/PAID/CANCELED/REFUNDED',
    `payment_method`   VARCHAR(20)  DEFAULT NULL,
    `payment_time`     DATETIME     DEFAULT NULL,
    `contact_name`     VARCHAR(100) DEFAULT NULL,
    `contact_phone`    VARCHAR(20)  DEFAULT NULL,
    `contact_email`    VARCHAR(100) DEFAULT NULL,
    `company_name`     VARCHAR(200) DEFAULT NULL,
    `invoice_required` TINYINT      DEFAULT 0,
    `invoice_title`    VARCHAR(200) DEFAULT NULL,
    `invoice_tax_no`   VARCHAR(50)  DEFAULT NULL,
    `remark`           VARCHAR(500) DEFAULT NULL,
    `created_by`       VARCHAR(64)  DEFAULT NULL,
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`      TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_payment_time` (`payment_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用购买订单';

-- 4. 支付记录表
CREATE TABLE IF NOT EXISTS `t_app_payment` (
    `id`                   BIGINT      NOT NULL AUTO_INCREMENT COMMENT '主键',
    `payment_no`           VARCHAR(50) NOT NULL COMMENT '支付流水号',
    `order_id`             BIGINT      NOT NULL,
    `order_no`             VARCHAR(50) NOT NULL,
    `tenant_id`            BIGINT      NOT NULL,
    `payment_method`       VARCHAR(20) NOT NULL COMMENT '支付方式: WECHAT/ALIPAY/BANK/OFFLINE',
    `payment_channel`      VARCHAR(50) DEFAULT NULL,
    `amount`               DECIMAL(10,2) NOT NULL,
    `status`               VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/SUCCESS/FAILED/REFUNDED',
    `third_party_no`       VARCHAR(100) DEFAULT NULL,
    `third_party_response` TEXT         DEFAULT NULL,
    `payment_time`         DATETIME     DEFAULT NULL,
    `refund_time`          DATETIME     DEFAULT NULL,
    `refund_reason`        VARCHAR(500) DEFAULT NULL,
    `remark`               VARCHAR(500) DEFAULT NULL,
    `create_time`          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_payment_no` (`payment_no`),
    KEY `idx_order_id` (`order_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_status` (`status`),
    KEY `idx_third_party_no` (`third_party_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用支付记录';

-- 初始应用数据（INSERT IGNORE 保证幂等）
INSERT IGNORE INTO `t_app_store` (`app_code`, `app_name`, `app_icon`, `app_desc`, `category`, `price_type`, `price_monthly`, `price_yearly`, `price_once`, `sort_order`, `is_hot`, `trial_days`, `status`, `features`) VALUES
('ORDER_SYNC',       '下单对接',       '📦', '与客户系统对接，自动同步订单数据，减少人工录入',                 '核心对接', 'MONTHLY', 299.00,  2990.00, 19999.00, 1, 1, 7, 'PUBLISHED', '["自动接收客户订单","订单状态同步","订单变更通知","批量导入导出","订单数据校验"]'),
('QUALITY_FEEDBACK', '质检反馈',       '✅', '质检结果实时同步，不良品反馈，质量数据分析',                     '核心对接', 'MONTHLY', 199.00,  1990.00, 19999.00, 2, 0, 7, 'PUBLISHED', '["质检结果推送","不良品反馈","质检报告生成","质量数据统计","异常预警通知"]'),
('LOGISTICS_SYNC',   '物流对接',       '🚚', '物流信息实时同步，发货通知，物流轨迹跟踪',                       '核心对接', 'MONTHLY', 149.00,  1490.00, 19999.00, 3, 1, 7, 'PUBLISHED', '["发货信息同步","物流轨迹跟踪","签收状态通知","退货物流对接","批量发货管理"]'),
('PAYMENT_SYNC',     '付款对接',       '💰', '付款信息自动同步，对账管理，结算数据对接',                       '核心对接', 'MONTHLY', 199.00,  1990.00, 19999.00, 4, 0, 7, 'PUBLISHED', '["付款信息同步","自动对账","结算数据推送","账单生成","付款状态跟踪"]'),
('MATERIAL_SUPPLY',  '面辅料供应对接', '🧵', '采购单自动同步、库存实时查询、价格自动更新、物流跟踪',           '核心对接', 'MONTHLY', 249.00,  2490.00, 19999.00, 5, 0, 7, 'PUBLISHED', '["采购订单自动推送","供应商库存实时查询","价格自动更新同步","发货物流跟踪","批量采购管理"]');

-- 修复已存在的数据（INSERT IGNORE不会更新已有记录，所以需要UPDATE）
UPDATE `t_app_store` SET `price_monthly`=299.00,  `price_yearly`=2990.00, `price_once`=19999.00 WHERE `app_code`='ORDER_SYNC';
UPDATE `t_app_store` SET `price_monthly`=199.00,  `price_yearly`=1990.00, `price_once`=19999.00 WHERE `app_code`='QUALITY_FEEDBACK';
UPDATE `t_app_store` SET `price_monthly`=149.00,  `price_yearly`=1490.00, `price_once`=19999.00 WHERE `app_code`='LOGISTICS_SYNC';
UPDATE `t_app_store` SET `price_monthly`=199.00,  `price_yearly`=1990.00, `price_once`=19999.00 WHERE `app_code`='PAYMENT_SYNC';
UPDATE `t_app_store` SET `price_monthly`=249.00,  `price_yearly`=2490.00, `price_once`=19999.00 WHERE `app_code`='MATERIAL_SUPPLY';


-- ======================================================================
-- Part 4: 客户应用管理（t_tenant_app + t_tenant_app_log）
-- (来自 V20260210__tenant_app.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_tenant_app` (
    `id`                    VARCHAR(64)  NOT NULL COMMENT '主键UUID',
    `tenant_id`             BIGINT       NOT NULL COMMENT '租户ID',
    `app_name`              VARCHAR(100) NOT NULL COMMENT '应用名称',
    `app_type`              VARCHAR(50)  NOT NULL COMMENT '应用类型: ORDER_SYNC/QUALITY_FEEDBACK/LOGISTICS_SYNC/PAYMENT_SYNC',
    `app_key`               VARCHAR(64)  NOT NULL COMMENT '应用密钥ID',
    `app_secret`            VARCHAR(128) NOT NULL COMMENT '应用密钥',
    `status`                VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    `callback_url`          VARCHAR(500) DEFAULT NULL COMMENT '客户回调URL',
    `callback_secret`       VARCHAR(64)  DEFAULT NULL COMMENT '回调签名密钥',
    `external_api_url`      VARCHAR(500) DEFAULT NULL COMMENT '客户系统API地址',
    `config_json`           TEXT         DEFAULT NULL COMMENT '对接配置JSON',
    `daily_quota`           INT          DEFAULT 0 COMMENT '日调用上限',
    `daily_used`            INT          DEFAULT 0 COMMENT '今日已调用次数',
    `last_quota_reset_time` DATETIME     DEFAULT NULL,
    `total_calls`           BIGINT       DEFAULT 0 COMMENT '总调用次数',
    `last_call_time`        DATETIME     DEFAULT NULL,
    `expire_time`           DATETIME     DEFAULT NULL COMMENT '过期时间',
    `remark`                VARCHAR(500) DEFAULT NULL,
    `created_by`            VARCHAR(64)  DEFAULT NULL,
    `create_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`           TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_key` (`app_key`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_type` (`app_type`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用管理';

CREATE TABLE IF NOT EXISTS `t_tenant_app_log` (
    `id`           VARCHAR(64)  NOT NULL COMMENT '主键UUID',
    `app_id`       VARCHAR(64)  DEFAULT NULL COMMENT '应用ID',
    `tenant_id`    BIGINT       DEFAULT NULL COMMENT '租户ID',
    `app_type`     VARCHAR(50)  DEFAULT NULL COMMENT '应用类型',
    `direction`    VARCHAR(20)  DEFAULT NULL COMMENT '方向: INBOUND/OUTBOUND',
    `http_method`  VARCHAR(10)  DEFAULT NULL,
    `request_path` VARCHAR(500) DEFAULT NULL,
    `request_body` TEXT         DEFAULT NULL,
    `response_code` INT         DEFAULT NULL,
    `response_body` TEXT        DEFAULT NULL,
    `cost_ms`      BIGINT       DEFAULT NULL COMMENT '耗时(毫秒)',
    `result`       VARCHAR(20)  DEFAULT NULL COMMENT '结果: SUCCESS/FAILED/ERROR',
    `error_message` VARCHAR(500) DEFAULT NULL,
    `client_ip`    VARCHAR(50)  DEFAULT NULL,
    `create_time`  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_app_id`     (`app_id`),
    KEY `idx_tenant_id`  (`tenant_id`),
    KEY `idx_create_time`(`create_time`),
    KEY `idx_result`     (`result`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用调用日志';


-- ======================================================================
-- Part 5: 成品结算审批状态持久化表
-- (来自 V20260215__finished_settlement_approval_status.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_finished_settlement_approval` (
    `settlement_id`    VARCHAR(64)  NOT NULL COMMENT '成品结算ID',
    `status`           VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT '审批状态: pending/approved',
    `approved_by_id`   VARCHAR(64)  DEFAULT NULL COMMENT '审批人ID',
    `approved_by_name` VARCHAR(100) DEFAULT NULL COMMENT '审批人名称',
    `approved_time`    DATETIME     DEFAULT NULL COMMENT '审批时间',
    `tenant_id`        BIGINT       DEFAULT NULL COMMENT '租户ID',
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`settlement_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_status`    (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='成品结算审批状态';


-- ======================================================================
-- Part 6: 修复成品结算视图（使用含利润率的报价价格，排除已取消订单）
-- (来自 V20260219__fix_settlement_view_price_and_cancelled.sql)
-- 注意: 该文件与 db/migration 中已有 V20260219 文件名冲突，内容纳入本文件
-- ======================================================================

DROP VIEW IF EXISTS `v_finished_product_settlement`;

CREATE VIEW `v_finished_product_settlement` AS
SELECT
    `po`.`id`             AS `order_id`,
    `po`.`order_no`       AS `order_no`,
    `po`.`status`         AS `status`,
    `po`.`style_no`       AS `style_no`,
    `po`.`factory_id`     AS `factory_id`,
    `po`.`factory_name`   AS `factory_name`,
    `po`.`order_quantity` AS `order_quantity`,

    -- 款式单价：优先使用含利润率的报价，没有报价时退回到 t_style_info.price
    COALESCE(`sq`.`total_price`, `si`.`price`, 0)         AS `style_final_price`,
    COALESCE(`sq`.`profit_rate`, 0)                        AS `target_profit_rate`,
    COALESCE(`wh`.`total_warehoused`, 0)                   AS `warehoused_quantity`,
    COALESCE(`wh`.`total_defects`, 0)                      AS `defect_quantity`,
    COALESCE(`wh`.`colors`, '')                            AS `colors`,
    COALESCE(`mat`.`total_material_cost`, 0)               AS `material_cost`,
    COALESCE(`scan`.`total_production_cost`, 0)            AS `production_cost`,

    (CASE
        WHEN (`po`.`order_quantity` > 0)
        THEN ROUND(COALESCE(`wh`.`total_defects`, 0)
            * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
               / `po`.`order_quantity`), 2)
        ELSE 0
    END) AS `defect_loss`,

    ROUND(COALESCE(`sq`.`total_price`, `si`.`price`, 0)
          * COALESCE(`wh`.`total_warehoused`, 0), 2) AS `total_amount`,

    ROUND(
        (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
        - COALESCE(`mat`.`total_material_cost`, 0)
        - COALESCE(`scan`.`total_production_cost`, 0)
        - (CASE
            WHEN (`po`.`order_quantity` > 0)
            THEN COALESCE(`wh`.`total_defects`, 0)
                 * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
                    / `po`.`order_quantity`)
            ELSE 0
           END)
    , 2) AS `profit`,

    (CASE
        WHEN (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0)) > 0
        THEN ROUND(
            (
                (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
                - COALESCE(`mat`.`total_material_cost`, 0)
                - COALESCE(`scan`.`total_production_cost`, 0)
                - (CASE
                    WHEN (`po`.`order_quantity` > 0)
                    THEN COALESCE(`wh`.`total_defects`, 0)
                         * ((COALESCE(`mat`.`total_material_cost`, 0) + COALESCE(`scan`.`total_production_cost`, 0))
                            / `po`.`order_quantity`)
                    ELSE 0
                   END)
            )
            / (COALESCE(`sq`.`total_price`, `si`.`price`, 0) * COALESCE(`wh`.`total_warehoused`, 0))
            * 100
        , 2)
        ELSE 0
    END) AS `profit_margin`,

    `po`.`create_time` AS `create_time`,
    `po`.`update_time` AS `update_time`,
    `po`.`tenant_id`   AS `tenant_id`

FROM `t_production_order` `po`
LEFT JOIN `t_style_info` `si`
    ON `po`.`style_no` = `si`.`style_no`
LEFT JOIN (
    SELECT sq1.`style_id`, sq1.`total_price`, sq1.`profit_rate`
    FROM `t_style_quotation` sq1
    INNER JOIN (
        SELECT `style_id`, MAX(`update_time`) AS max_update_time
        FROM `t_style_quotation`
        GROUP BY `style_id`
    ) sq_latest ON sq1.`style_id` = sq_latest.`style_id`
               AND sq1.`update_time` = sq_latest.`max_update_time`
) `sq` ON `sq`.`style_id` = `si`.`id`
LEFT JOIN (
    SELECT `pw`.`order_no`,
           SUM(CASE WHEN `pw`.`quality_status` = 'QUALIFIED'                THEN `pw`.`warehousing_quantity` ELSE 0 END) AS `total_warehoused`,
           SUM(CASE WHEN `pw`.`quality_status` IN ('UNQUALIFIED','DEFECTIVE') THEN `pw`.`warehousing_quantity` ELSE 0 END) AS `total_defects`,
           GROUP_CONCAT(DISTINCT CASE WHEN `cb`.`color` IS NOT NULL THEN `cb`.`color` ELSE '' END
                        ORDER BY `cb`.`color` ASC SEPARATOR ', ') AS `colors`
    FROM `t_product_warehousing` `pw`
    LEFT JOIN `t_cutting_bundle` `cb` ON `pw`.`cutting_bundle_id` = `cb`.`id`
    GROUP BY `pw`.`order_no`
) `wh` ON `po`.`order_no` = `wh`.`order_no`
LEFT JOIN (
    SELECT `order_no`, SUM(`total_amount`) AS `total_material_cost`
    FROM `t_material_purchase`
    WHERE `status` IN ('RECEIVED','COMPLETED')
    GROUP BY `order_no`
) `mat` ON `po`.`order_no` = `mat`.`order_no`
LEFT JOIN (
    SELECT `order_no`, SUM(`scan_cost`) AS `total_production_cost`
    FROM `t_scan_record`
    WHERE `scan_cost` IS NOT NULL
    GROUP BY `order_no`
) `scan` ON `po`.`order_no` = `scan`.`order_no`
-- 排除已取消/报废的订单
WHERE `po`.`status` NOT IN ('CANCELLED','cancelled','DELETED','deleted','废弃','已取消')
ORDER BY `po`.`create_time` DESC;


-- ======================================================================
-- Part 7: 订单转移功能 - 增加转工厂能力
-- (来自 V20260219_order_transfer_factory.sql)
-- ======================================================================

ALTER TABLE `order_transfer`
    ADD COLUMN `transfer_type`   VARCHAR(10)  NOT NULL DEFAULT 'user'
        COMMENT '转移类型: user=转人员, factory=转工厂',
    ADD COLUMN `to_factory_id`   VARCHAR(36)  NULL
        COMMENT '目标工厂ID（transfer_type=factory时使用）',
    ADD COLUMN `to_factory_name` VARCHAR(100) NULL
        COMMENT '目标工厂名称（冗余）';

CREATE INDEX IF NOT EXISTS `idx_order_transfer_tenant_type`
    ON `order_transfer` (`tenant_id`, `transfer_type`, `status`);


-- ======================================================================
-- Part 8: 面辅料料卷/箱管理表
-- (来自 V20260219b__material_roll.sql)
-- ======================================================================

CREATE TABLE IF NOT EXISTS `t_material_roll` (
    `id`               VARCHAR(32)   NOT NULL COMMENT '主键ID',
    `roll_code`        VARCHAR(30)   NOT NULL COMMENT '料卷/箱编号（二维码内容）',
    `inbound_id`       VARCHAR(32)   DEFAULT NULL COMMENT '关联入库单ID',
    `inbound_no`       VARCHAR(50)   DEFAULT NULL COMMENT '入库单号（冗余）',
    `material_code`    VARCHAR(50)   NOT NULL COMMENT '物料编码',
    `material_name`    VARCHAR(100)  NOT NULL COMMENT '物料名称',
    `material_type`    VARCHAR(20)   DEFAULT NULL COMMENT '物料类型: 面料/辅料/其他',
    `color`            VARCHAR(50)   DEFAULT NULL COMMENT '颜色',
    `specifications`   VARCHAR(100)  DEFAULT NULL COMMENT '规格',
    `unit`             VARCHAR(20)   DEFAULT NULL COMMENT '单位',
    `quantity`         DECIMAL(10,2) NOT NULL COMMENT '本卷/箱数量',
    `warehouse_location` VARCHAR(50) NOT NULL DEFAULT '默认仓' COMMENT '存放仓库',
    `status`           VARCHAR(20)   NOT NULL DEFAULT 'IN_STOCK'
                       COMMENT '状态: IN_STOCK-在库/ISSUED-已发料/RETURNED-已退回',
    `issued_order_id`  VARCHAR(32)   DEFAULT NULL COMMENT '发料关联裁剪单ID',
    `issued_order_no`  VARCHAR(50)   DEFAULT NULL COMMENT '发料关联裁剪单号',
    `issued_time`      DATETIME      DEFAULT NULL COMMENT '发料时间',
    `issued_by_id`     VARCHAR(32)   DEFAULT NULL COMMENT '发料操作人ID',
    `issued_by_name`   VARCHAR(50)   DEFAULT NULL COMMENT '发料操作人姓名',
    `supplier_name`    VARCHAR(100)  DEFAULT NULL COMMENT '供应商名称',
    `remark`           VARCHAR(255)  DEFAULT NULL COMMENT '备注',
    `tenant_id`        VARCHAR(32)   DEFAULT NULL COMMENT '租户ID',
    `creator_id`       VARCHAR(32)   DEFAULT NULL COMMENT '创建人ID',
    `creator_name`     VARCHAR(50)   DEFAULT NULL COMMENT '创建人姓名',
    `create_time`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`      TINYINT       DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_roll_code` (`roll_code`, `tenant_id`),
    INDEX `idx_inbound_id`    (`inbound_id`),
    INDEX `idx_material_code` (`material_code`),
    INDEX `idx_status`        (`status`),
    INDEX `idx_tenant_id`     (`tenant_id`),
    INDEX `idx_create_time`   (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='面辅料料卷/箱明细 - 每行对应一张二维码标签';

-- 料卷编号日序列表（生成唯一流水号）
CREATE TABLE IF NOT EXISTS `t_material_roll_sequence` (
    `id`        INT  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `roll_date` DATE NOT NULL COMMENT '日期',
    `seq`       INT  NOT NULL DEFAULT 1 COMMENT '当日序号',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_roll_date` (`roll_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='料卷编号日序列表';


-- ======================================================================
-- Part 9: 工厂类型区分 + 工资支付方式默认值修复
-- (来自 V20260220_factory_type_payment_method.sql)
-- ======================================================================

-- 修复 payment_method 缺少默认值（修复创建 pending 记录 500 错误）
ALTER TABLE `t_wage_payment`
    MODIFY COLUMN `payment_method` VARCHAR(20) NOT NULL DEFAULT 'OFFLINE'
    COMMENT '支付方式: OFFLINE=线下, BANK=银行转账, WECHAT=微信, ALIPAY=支付宝';

-- 新增工厂类型字段（默认所有工厂为 EXTERNAL 外部工厂）
ALTER TABLE `t_factory`
    ADD COLUMN `factory_type` VARCHAR(20) NOT NULL DEFAULT 'EXTERNAL'
    COMMENT '工厂类型: INTERNAL=本厂内部按人员结算, EXTERNAL=外部工厂按工厂结算';


-- ======================================================================
-- Part 10: 微信小程序 openid 字段
-- (来自 V20260221__add_user_wechat_openid.sql)
-- 注意: 该文件与 db/migration 已有 V20260221 文件名冲突，内容纳入本文件
-- ======================================================================

ALTER TABLE `t_user`
    ADD COLUMN `openid` VARCHAR(128) DEFAULT NULL
    COMMENT '微信小程序 openid（用于一键免密登录）';

CREATE INDEX IF NOT EXISTS `idx_t_user_openid` ON `t_user` (`openid`);
