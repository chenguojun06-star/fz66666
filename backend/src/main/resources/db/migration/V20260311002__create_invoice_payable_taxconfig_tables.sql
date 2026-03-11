-- ============================================================
-- 财务模块补齐：发票管理 + 应付账款 + 税率配置
-- 2026-03-11 | 幂等脚本，可重复执行
-- ============================================================

-- ─── 1. 发票记录表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_invoice` (
    `id`                VARCHAR(64)    NOT NULL,
    `invoice_no`        VARCHAR(64)    NOT NULL COMMENT '发票号码 INV+时间戳',
    `invoice_type`      VARCHAR(20)    NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL=增值税普通发票 SPECIAL=增值税专用发票',
    `title_name`        VARCHAR(200)   NOT NULL DEFAULT '' COMMENT '购方名称',
    `title_tax_no`      VARCHAR(64)    NOT NULL DEFAULT '' COMMENT '购方税号',
    `title_address`     VARCHAR(255)   NULL COMMENT '购方地址',
    `title_phone`       VARCHAR(32)    NULL COMMENT '购方电话',
    `title_bank_name`   VARCHAR(100)   NULL COMMENT '购方开户行',
    `title_bank_account` VARCHAR(64)   NULL COMMENT '购方银行账号',
    `seller_name`       VARCHAR(200)   NOT NULL DEFAULT '' COMMENT '销方名称(本公司)',
    `seller_tax_no`     VARCHAR(64)    NOT NULL DEFAULT '' COMMENT '销方税号',
    `amount`            DECIMAL(14,2)  NOT NULL DEFAULT 0.00 COMMENT '不含税金额',
    `tax_rate`          DECIMAL(6,4)   NOT NULL DEFAULT 0.0000 COMMENT '税率(如0.1300=13%)',
    `tax_amount`        DECIMAL(14,2)  NOT NULL DEFAULT 0.00 COMMENT '税额',
    `total_amount`      DECIMAL(14,2)  NOT NULL DEFAULT 0.00 COMMENT '价税合计',
    `related_biz_type`  VARCHAR(32)    NULL COMMENT '关联业务类型 RECONCILIATION/SETTLEMENT/REIMBURSEMENT/ORDER',
    `related_biz_id`    VARCHAR(64)    NULL COMMENT '关联业务单据ID',
    `related_biz_no`    VARCHAR(64)    NULL COMMENT '关联单据号',
    `status`            VARCHAR(20)    NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/ISSUED/CANCELLED',
    `issue_date`        DATE           NULL COMMENT '开票日期',
    `remark`            VARCHAR(500)   NULL,
    `delete_flag`       INT            NOT NULL DEFAULT 0,
    `creator_id`        VARCHAR(64)    NULL,
    `creator_name`      VARCHAR(64)    NULL,
    `tenant_id`         BIGINT         NOT NULL,
    `create_time`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_invoice_tenant_status` (`tenant_id`, `status`),
    INDEX `idx_invoice_no` (`invoice_no`),
    INDEX `idx_invoice_biz` (`related_biz_type`, `related_biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='发票记录表';

-- ─── 2. 应付账款表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_payable` (
    `id`                VARCHAR(64)    NOT NULL,
    `payable_no`        VARCHAR(64)    NOT NULL COMMENT '应付单号 AP+时间戳',
    `supplier_id`       VARCHAR(64)    NULL COMMENT '供应商ID',
    `supplier_name`     VARCHAR(200)   NULL COMMENT '供应商名称(冗余)',
    `order_id`          VARCHAR(64)    NULL COMMENT '关联采购单/对账单ID',
    `order_no`          VARCHAR(64)    NULL COMMENT '关联单号',
    `amount`            DECIMAL(14,2)  NOT NULL DEFAULT 0.00 COMMENT '应付总金额',
    `paid_amount`       DECIMAL(14,2)  NOT NULL DEFAULT 0.00 COMMENT '已付金额',
    `due_date`          DATE           NULL COMMENT '约定付款日期',
    `status`            VARCHAR(20)    NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/PARTIAL/PAID/OVERDUE',
    `description`       VARCHAR(500)   NULL COMMENT '备注',
    `delete_flag`       INT            NOT NULL DEFAULT 0,
    `creator_id`        VARCHAR(64)    NULL,
    `creator_name`      VARCHAR(64)    NULL,
    `tenant_id`         BIGINT         NOT NULL,
    `create_time`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_payable_tenant_status` (`tenant_id`, `status`),
    INDEX `idx_payable_no` (`payable_no`),
    INDEX `idx_payable_supplier` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应付账款表';

-- ─── 3. 税率配置表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_tax_config` (
    `id`                VARCHAR(64)    NOT NULL,
    `tax_name`          VARCHAR(100)   NOT NULL COMMENT '税种名称(增值税/企业所得税/附加税等)',
    `tax_code`          VARCHAR(32)    NOT NULL COMMENT '税种代码(VAT/CIT/SURCHARGE等)',
    `tax_rate`          DECIMAL(6,4)   NOT NULL DEFAULT 0.0000 COMMENT '税率(如0.1300=13%)',
    `is_default`        TINYINT        NOT NULL DEFAULT 0 COMMENT '是否默认税率 1=是',
    `effective_date`    DATE           NULL COMMENT '生效日期',
    `expiry_date`       DATE           NULL COMMENT '到期日(NULL=永久有效)',
    `description`       VARCHAR(500)   NULL,
    `status`            VARCHAR(20)    NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/INACTIVE',
    `tenant_id`         BIGINT         NOT NULL,
    `creator_id`        VARCHAR(64)    NULL,
    `create_time`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_taxconfig_tenant` (`tenant_id`, `status`),
    INDEX `idx_taxconfig_code` (`tax_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='税率配置表';
