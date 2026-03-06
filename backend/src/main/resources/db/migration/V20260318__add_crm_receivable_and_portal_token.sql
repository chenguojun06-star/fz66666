-- CRM 应收账款表
CREATE TABLE IF NOT EXISTS `t_receivable` (
    `id`               VARCHAR(36)    NOT NULL COMMENT '主键（UUID）',
    `receivable_no`    VARCHAR(50)    NOT NULL COMMENT '应收单号（AR+时间戳）',
    `customer_id`      VARCHAR(36)    NOT NULL COMMENT '客户ID',
    `customer_name`    VARCHAR(200)   NOT NULL COMMENT '客户名称（冗余，查询用）',
    `order_id`         VARCHAR(36)    DEFAULT NULL COMMENT '关联生产订单ID（可为空）',
    `order_no`         VARCHAR(100)   DEFAULT NULL COMMENT '关联订单号（冗余）',
    `amount`           DECIMAL(12, 2) NOT NULL COMMENT '应收总金额',
    `received_amount`  DECIMAL(12, 2) NOT NULL DEFAULT 0 COMMENT '已收金额',
    `due_date`         DATE           DEFAULT NULL COMMENT '约定到账日期',
    `status`           VARCHAR(20)    NOT NULL DEFAULT 'PENDING'
                           COMMENT '状态：PENDING=待收款 PARTIAL=部分到账 PAID=已结清 OVERDUE=逾期',
    `description`      VARCHAR(500)   DEFAULT NULL COMMENT '备注',
    `tenant_id`        BIGINT         NOT NULL COMMENT '租户ID',
    `delete_flag`      TINYINT        NOT NULL DEFAULT 0 COMMENT '软删除：0=正常 1=已删除',
    `creator_id`       VARCHAR(64)    DEFAULT NULL,
    `creator_name`     VARCHAR(100)   DEFAULT NULL,
    `create_time`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_receivable_no` (`receivable_no`),
    KEY `idx_receivable_customer` (`customer_id`, `delete_flag`),
    KEY `idx_receivable_tenant_status` (`tenant_id`, `status`, `delete_flag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='应收账款';

-- CRM 客户追踪门户令牌表
CREATE TABLE IF NOT EXISTS `t_customer_portal_token` (
    `id`          VARCHAR(36)  NOT NULL COMMENT '主键（UUID）',
    `token`       VARCHAR(64)  NOT NULL COMMENT '访问令牌（随机64位十六进制）',
    `customer_id` VARCHAR(36)  NOT NULL COMMENT '客户ID',
    `order_id`    VARCHAR(36)  NOT NULL COMMENT '关联生产订单ID',
    `order_no`    VARCHAR(100) DEFAULT NULL COMMENT '订单号（冗余）',
    `expire_time` DATETIME     NOT NULL COMMENT '过期时间',
    `tenant_id`   BIGINT       NOT NULL,
    `creator_id`  VARCHAR(64)  DEFAULT NULL,
    `creator_name` VARCHAR(100) DEFAULT NULL,
    `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_portal_token` (`token`),
    KEY `idx_portal_customer_order` (`customer_id`, `order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='客户订单追踪门户令牌';
