-- ============================================
-- SaaS应用商店系统 - 建表SQL
-- 功能：应用商店 + 订阅管理 + 支付流程
-- 日期: 2026-02-10
-- ============================================

-- 1. 应用商店表（可购买的应用列表）
CREATE TABLE IF NOT EXISTS `t_app_store` (
    `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
    `app_code` varchar(50) NOT NULL COMMENT '应用编码：PRODUCTION/STYLE/FINANCE/WAREHOUSE/REPORT',
    `app_name` varchar(100) NOT NULL COMMENT '应用名称',
    `app_icon` varchar(200) DEFAULT NULL COMMENT '应用图标URL',
    `app_desc` varchar(500) DEFAULT NULL COMMENT '应用简介',
    `app_detail` text DEFAULT NULL COMMENT '应用详细说明（富文本）',
    `category` varchar(50) DEFAULT NULL COMMENT '应用分类：核心应用/增值服务/数据分析',
    `price_type` varchar(20) NOT NULL DEFAULT 'MONTHLY' COMMENT '计费类型：FREE/MONTHLY/YEARLY/ONCE',
    `price_monthly` decimal(10,2) DEFAULT 0.00 COMMENT '月付价格',
    `price_yearly` decimal(10,2) DEFAULT 0.00 COMMENT '年付价格',
    `price_once` decimal(10,2) DEFAULT 0.00 COMMENT '买断价格',
    `sort_order` int DEFAULT 0 COMMENT '排序序号（升序）',
    `is_hot` tinyint DEFAULT 0 COMMENT '是否热门应用',
    `is_new` tinyint DEFAULT 0 COMMENT '是否新应用',
    `status` varchar(20) NOT NULL DEFAULT 'PUBLISHED' COMMENT '状态：DRAFT/PUBLISHED/OFFLINE',
    `features` text DEFAULT NULL COMMENT '功能列表JSON ["功能1","功能2"]',
    `screenshots` text DEFAULT NULL COMMENT '应用截图JSON ["url1","url2"]',
    `min_users` int DEFAULT 1 COMMENT '最少用户数',
    `max_users` int DEFAULT 999 COMMENT '最大用户数',
    `trial_days` int DEFAULT 0 COMMENT '试用天数（0=不支持试用）',
    `remark` varchar(500) DEFAULT NULL COMMENT '备注',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag` tinyint DEFAULT 0 COMMENT '逻辑删除',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_code` (`app_code`),
    KEY `idx_category` (`category`),
    KEY `idx_status` (`status`),
    KEY `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用商店-可购买应用列表';

-- 2. 租户订阅表（租户购买的应用）
CREATE TABLE IF NOT EXISTS `t_tenant_subscription` (
    `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
    `subscription_no` varchar(50) NOT NULL COMMENT '订阅编号：SUB20260210001',
    `tenant_id` bigint NOT NULL COMMENT '租户ID',
    `tenant_name` varchar(100) DEFAULT NULL COMMENT '租户名称（冗余）',
    `app_id` bigint NOT NULL COMMENT '应用ID（关联t_app_store）',
    `app_code` varchar(50) NOT NULL COMMENT '应用编码（冗余）',
    `app_name` varchar(100) NOT NULL COMMENT '应用名称（冗余）',
    `subscription_type` varchar(20) NOT NULL COMMENT '订阅类型：TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `price` decimal(10,2) DEFAULT 0.00 COMMENT '订阅价格',
    `user_count` int DEFAULT 1 COMMENT '购买用户数',
    `start_time` datetime NOT NULL COMMENT '生效时间',
    `end_time` datetime DEFAULT NULL COMMENT '到期时间（null=永久）',
    `status` varchar(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：TRIAL/ACTIVE/EXPIRED/CANCELED',
    `auto_renew` tinyint DEFAULT 0 COMMENT '是否自动续费',
    `order_id` bigint DEFAULT NULL COMMENT '关联订单ID',
    `remark` varchar(500) DEFAULT NULL COMMENT '备注',
    `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag` tinyint DEFAULT 0 COMMENT '逻辑删除',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_subscription_no` (`subscription_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_end_time` (`end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='租户应用订阅';

-- 3. 应用订单表（购买订单）
CREATE TABLE IF NOT EXISTS `t_app_order` (
    `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_no` varchar(50) NOT NULL COMMENT '订单号：ORD20260210001',
    `tenant_id` bigint NOT NULL COMMENT '租户ID',
    `tenant_name` varchar(100) DEFAULT NULL COMMENT '租户名称',
    `app_id` bigint NOT NULL COMMENT '应用ID',
    `app_code` varchar(50) NOT NULL COMMENT '应用编码',
    `app_name` varchar(100) NOT NULL COMMENT '应用名称',
    `order_type` varchar(20) NOT NULL COMMENT '订单类型：NEW/RENEW/UPGRADE',
    `subscription_type` varchar(20) NOT NULL COMMENT '订阅类型：TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `user_count` int DEFAULT 1 COMMENT '购买用户数',
    `unit_price` decimal(10,2) DEFAULT 0.00 COMMENT '单价',
    `total_amount` decimal(10,2) NOT NULL COMMENT '订单金额',
    `discount_amount` decimal(10,2) DEFAULT 0.00 COMMENT '优惠金额',
    `actual_amount` decimal(10,2) NOT NULL COMMENT '实付金额',
    `status` varchar(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/PAID/CANCELED/REFUNDED',
    `payment_method` varchar(20) DEFAULT NULL COMMENT '支付方式：WECHAT/ALIPAY/BANK/OFFLINE',
    `payment_time` datetime DEFAULT NULL COMMENT '支付时间',
    `contact_name` varchar(100) DEFAULT NULL COMMENT '联系人姓名',
    `contact_phone` varchar(20) DEFAULT NULL COMMENT '联系电话',
    `contact_email` varchar(100) DEFAULT NULL COMMENT '联系邮箱',
    `company_name` varchar(200) DEFAULT NULL COMMENT '公司名称',
    `invoice_required` tinyint DEFAULT 0 COMMENT '是否需要发票',
    `invoice_title` varchar(200) DEFAULT NULL COMMENT '发票抬头',
    `invoice_tax_no` varchar(50) DEFAULT NULL COMMENT '纳税人识别号',
    `remark` varchar(500) DEFAULT NULL COMMENT '备注',
    `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag` tinyint DEFAULT 0 COMMENT '逻辑删除',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_payment_time` (`payment_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用购买订单';

-- 4. 支付记录表
CREATE TABLE IF NOT EXISTS `t_app_payment` (
    `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
    `payment_no` varchar(50) NOT NULL COMMENT '支付流水号：PAY20260210001',
    `order_id` bigint NOT NULL COMMENT '订单ID',
    `order_no` varchar(50) NOT NULL COMMENT '订单号（冗余）',
    `tenant_id` bigint NOT NULL COMMENT '租户ID',
    `payment_method` varchar(20) NOT NULL COMMENT '支付方式：WECHAT/ALIPAY/BANK/OFFLINE',
    `payment_channel` varchar(50) DEFAULT NULL COMMENT '支付渠道：微信扫码/支付宝H5/银行转账',
    `amount` decimal(10,2) NOT NULL COMMENT '支付金额',
    `status` varchar(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/SUCCESS/FAILED/REFUNDED',
    `third_party_no` varchar(100) DEFAULT NULL COMMENT '第三方交易号',
    `third_party_response` text DEFAULT NULL COMMENT '第三方响应JSON',
    `payment_time` datetime DEFAULT NULL COMMENT '支付成功时间',
    `refund_time` datetime DEFAULT NULL COMMENT '退款时间',
    `refund_reason` varchar(500) DEFAULT NULL COMMENT '退款原因',
    `remark` varchar(500) DEFAULT NULL COMMENT '备注',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_payment_no` (`payment_no`),
    KEY `idx_order_id` (`order_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_status` (`status`),
    KEY `idx_third_party_no` (`third_party_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用支付记录';

-- 5. 插入初始应用数据（4个对接应用，均支持7天免费试用）
INSERT INTO `t_app_store` (`app_code`, `app_name`, `app_icon`, `app_desc`, `category`, `price_type`, `price_monthly`, `price_yearly`, `sort_order`, `is_hot`, `trial_days`, `status`, `features`) VALUES
('ORDER_SYNC', '下单对接', '📦', '与客户系统对接，自动同步订单数据，减少人工录入', '核心对接', 'MONTHLY', 999.00, 9990.00, 1, 1, 7, 'PUBLISHED',
 '["自动接收客户订单","订单状态同步","订单变更通知","批量导入导出","订单数据校验"]'),
('QUALITY_FEEDBACK', '质检反馈', '✅', '质检结果实时同步，不良品反馈，质量数据分析', '核心对接', 'MONTHLY', 799.00, 7990.00, 2, 0, 7, 'PUBLISHED',
 '["质检结果推送","不良品反馈","质检报告生成","质量数据统计","异常预警通知"]'),
('LOGISTICS_SYNC', '物流对接', '🚚', '物流信息实时同步，发货通知，物流轨迹跟踪', '核心对接', 'MONTHLY', 599.00, 5990.00, 3, 1, 7, 'PUBLISHED',
 '["发货信息同步","物流轨迹跟踪","签收状态通知","退货物流对接","批量发货管理"]'),
('PAYMENT_SYNC', '付款对接', '💰', '付款信息自动同步，对账管理，结算数据对接', '核心对接', 'MONTHLY', 699.00, 6990.00, 4, 0, 7, 'PUBLISHED',
 '["付款信息同步","自动对账","结算数据推送","账单生成","付款状态跟踪"]'),
('MATERIAL_SUPPLY', '面辅料供应对接', '🧵', '采购单自动同步、库存实时查询、价格自动更新、物流跟踪', '核心对接', 'MONTHLY', 899.00, 8990.00, 5, 0, 7, 'PUBLISHED',
 '["采购订单自动推送","供应商库存实时查询","价格自动更新同步","发货物流跟踪","批量采购管理"]');
