-- ======================================================================
-- 遗漏的建表 + 字段补全 (来自 backend/sql/ 下8个从未执行的手工脚本)
-- 涵盖文件:
--   20260131_create_material_inbound.sql      (入库表)
--   20260131_create_operation_log.sql         (操作日志表 - 兼容V20260221b)
--   20260131_create_pattern_revision_table.sql (纸样修改记录表)
--   20260131_alter_style_bom_add_stock_fields.sql (BOM库存字段)
--   20260131_enhance_material_reconciliation_fields.sql (对账表字段)
--   20260131_add_operator_fields_system_wide.sql (操作人字段)
--   20260201_add_production_order_creator_tracking.sql (创建人追踪)
--   create_expense_reimbursement.sql          (费用报销表)
-- 日期：2026-02-23
-- ======================================================================

-- ======================================================================
-- Part 1：面辅料入库记录表（含序号表）
-- ======================================================================
CREATE TABLE IF NOT EXISTS `t_material_inbound` (
    `id`                VARCHAR(32)  NOT NULL PRIMARY KEY COMMENT '主键ID',
    `inbound_no`        VARCHAR(50)  NOT NULL UNIQUE COMMENT '入库单号 IB+日期+序号',
    `purchase_id`       VARCHAR(32)  DEFAULT NULL COMMENT '关联采购单ID',
    `material_code`     VARCHAR(50)  NOT NULL COMMENT '物料编码',
    `material_name`     VARCHAR(100) NOT NULL COMMENT '物料名称',
    `material_type`     VARCHAR(20)  DEFAULT NULL COMMENT '物料类型',
    `color`             VARCHAR(50)  DEFAULT NULL COMMENT '颜色',
    `size`              VARCHAR(50)  DEFAULT NULL COMMENT '规格',
    `inbound_quantity`  INT          NOT NULL COMMENT '入库数量',
    `warehouse_location` VARCHAR(100) DEFAULT '默认仓' COMMENT '仓库位置',
    `supplier_name`     VARCHAR(100) DEFAULT NULL COMMENT '供应商名称',
    `operator_id`       VARCHAR(32)  DEFAULT NULL COMMENT '操作人ID',
    `operator_name`     VARCHAR(50)  DEFAULT NULL COMMENT '操作人姓名',
    `inbound_time`      DATETIME     NOT NULL COMMENT '入库时间',
    `remark`            TEXT         DEFAULT NULL COMMENT '备注',
    `tenant_id`         BIGINT       DEFAULT NULL COMMENT '租户ID',
    `create_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`       TINYINT      DEFAULT 0,
    INDEX `idx_purchase_id`   (`purchase_id`),
    INDEX `idx_material_code` (`material_code`),
    INDEX `idx_inbound_time`  (`inbound_time`),
    INDEX `idx_tenant_id`     (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='面辅料入库记录表';

CREATE TABLE IF NOT EXISTS `t_material_inbound_sequence` (
    `id`              INT  NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `inbound_date`    DATE NOT NULL COMMENT '入库日期',
    `sequence_number` INT  NOT NULL DEFAULT 1 COMMENT '当日序号',
    UNIQUE KEY `uk_inbound_date` (`inbound_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入库单号序列表';

-- 采购表补充入库记录关联字段
ALTER TABLE `t_material_purchase`
    ADD COLUMN IF NOT EXISTS `inbound_record_id` VARCHAR(32) DEFAULT NULL
    COMMENT '最新入库单ID';
CREATE INDEX IF NOT EXISTS `idx_mpu_inbound_record_id` ON `t_material_purchase` (`inbound_record_id`);


-- ======================================================================
-- Part 2：纸样修改记录表
-- ======================================================================
CREATE TABLE IF NOT EXISTS `t_pattern_revision` (
    `id`                    VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_id`              VARCHAR(64)  DEFAULT NULL COMMENT '款号ID',
    `style_no`              VARCHAR(100) DEFAULT NULL COMMENT '款号',
    `revision_no`           VARCHAR(100) DEFAULT NULL COMMENT '修改版本号（V1.0/V1.1/V2.0）',
    `revision_type`         VARCHAR(50)  DEFAULT NULL COMMENT '修改类型: MINOR/MAJOR/URGENT',
    `revision_reason`       TEXT         DEFAULT NULL COMMENT '修改原因',
    `revision_content`      TEXT         DEFAULT NULL COMMENT '修改内容详情',
    `before_changes`        TEXT         DEFAULT NULL COMMENT '修改前信息JSON',
    `after_changes`         TEXT         DEFAULT NULL COMMENT '修改后信息JSON',
    `attachment_urls`       TEXT         DEFAULT NULL COMMENT '附件URL列表JSON',
    `status`                VARCHAR(50)  DEFAULT 'DRAFT'
        COMMENT '状态: DRAFT/SUBMITTED/APPROVED/REJECTED/COMPLETED',
    `revision_date`         DATE         DEFAULT NULL COMMENT '修改日期',
    `expected_complete_date` DATE        DEFAULT NULL COMMENT '预计完成日期',
    `actual_complete_date`  DATE         DEFAULT NULL COMMENT '实际完成日期',
    `maintainer_id`         VARCHAR(64)  DEFAULT NULL COMMENT '维护人ID',
    `maintainer_name`       VARCHAR(100) DEFAULT NULL COMMENT '维护人姓名',
    `maintain_time`         DATETIME     DEFAULT NULL COMMENT '维护时间',
    `submitter_id`          VARCHAR(64)  DEFAULT NULL COMMENT '提交人ID',
    `submitter_name`        VARCHAR(100) DEFAULT NULL COMMENT '提交人姓名',
    `submit_time`           DATETIME     DEFAULT NULL COMMENT '提交时间',
    `approver_id`           VARCHAR(64)  DEFAULT NULL COMMENT '审核人ID',
    `approver_name`         VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    `approval_time`         DATETIME     DEFAULT NULL COMMENT '审核时间',
    `approval_comment`      TEXT         DEFAULT NULL COMMENT '审核意见',
    `pattern_maker_id`      VARCHAR(64)  DEFAULT NULL COMMENT '纸样师傅ID',
    `pattern_maker_name`    VARCHAR(100) DEFAULT NULL COMMENT '纸样师傅姓名',
    `factory_id`            VARCHAR(64)  DEFAULT NULL COMMENT '工厂ID',
    `tenant_id`             BIGINT       DEFAULT NULL COMMENT '租户ID',
    `remark`                TEXT         DEFAULT NULL COMMENT '备注',
    `create_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `create_by`             VARCHAR(100) DEFAULT NULL COMMENT '创建人',
    `update_by`             VARCHAR(100) DEFAULT NULL COMMENT '更新人',
    INDEX `idx_style_no`       (`style_no`),
    INDEX `idx_style_id`       (`style_id`),
    INDEX `idx_maintainer`     (`maintainer_id`),
    INDEX `idx_status`         (`status`),
    INDEX `idx_revision_date`  (`revision_date`),
    INDEX `idx_tenant_id`      (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='纸样修改记录表';


-- ======================================================================
-- Part 3：费用报销表
-- ======================================================================
CREATE TABLE IF NOT EXISTS `t_expense_reimbursement` (
    `id`                VARCHAR(64)   NOT NULL PRIMARY KEY COMMENT '主键UUID',
    `reimbursement_no`  VARCHAR(64)   NOT NULL UNIQUE COMMENT '报销单号 EX+日期+序号',
    `applicant_id`      BIGINT        NOT NULL COMMENT '申请人ID',
    `applicant_name`    VARCHAR(64)   NOT NULL COMMENT '申请人姓名',
    `expense_type`      VARCHAR(32)   NOT NULL
        COMMENT '费用类型: taxi/travel/material_advance/office/other',
    `title`             VARCHAR(200)  NOT NULL COMMENT '报销标题/事由',
    `amount`            DECIMAL(12,2) NOT NULL COMMENT '报销金额',
    `expense_date`      DATE          NOT NULL COMMENT '费用发生日期',
    `description`       TEXT          DEFAULT NULL COMMENT '详细说明',
    `order_no`          VARCHAR(64)   DEFAULT NULL COMMENT '关联订单号',
    `supplier_name`     VARCHAR(128)  DEFAULT NULL COMMENT '供应商名称',
    `payment_account`   VARCHAR(128)  DEFAULT NULL COMMENT '收款账号',
    `payment_method`    VARCHAR(32)   DEFAULT 'bank_transfer'
        COMMENT '付款方式: bank_transfer/alipay/wechat',
    `account_name`      VARCHAR(64)   DEFAULT NULL COMMENT '收款户名',
    `bank_name`         VARCHAR(128)  DEFAULT NULL COMMENT '开户银行',
    `attachments`       TEXT          DEFAULT NULL COMMENT '附件URL列表JSON',
    `status`            VARCHAR(20)   NOT NULL DEFAULT 'pending'
        COMMENT '状态: pending/approved/rejected/paid',
    `approver_id`       BIGINT        DEFAULT NULL COMMENT '审批人ID',
    `approver_name`     VARCHAR(64)   DEFAULT NULL COMMENT '审批人姓名',
    `approval_time`     DATETIME      DEFAULT NULL COMMENT '审批时间',
    `approval_remark`   VARCHAR(500)  DEFAULT NULL COMMENT '审批备注',
    `payment_time`      DATETIME      DEFAULT NULL COMMENT '付款时间',
    `payment_by`        VARCHAR(64)   DEFAULT NULL COMMENT '付款操作人',
    `create_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `create_by`         VARCHAR(64)   DEFAULT NULL,
    `update_by`         VARCHAR(64)   DEFAULT NULL,
    `delete_flag`       INT           NOT NULL DEFAULT 0,
    `tenant_id`         BIGINT        DEFAULT NULL COMMENT '租户ID',
    KEY `idx_applicant_id` (`applicant_id`),
    KEY `idx_status`       (`status`),
    KEY `idx_expense_type` (`expense_type`),
    KEY `idx_create_time`  (`create_time`),
    KEY `idx_tenant_id`    (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='费用报销表';


-- ======================================================================
-- Part 4：t_style_bom 库存检查字段
-- ======================================================================
ALTER TABLE `t_style_bom`
    ADD COLUMN IF NOT EXISTS `stock_status`      VARCHAR(20) DEFAULT NULL
        COMMENT '库存状态: sufficient/insufficient/none/unchecked',
    ADD COLUMN IF NOT EXISTS `available_stock`   INT         DEFAULT NULL
        COMMENT '可用库存（quantity - locked_quantity）',
    ADD COLUMN IF NOT EXISTS `required_purchase` INT         DEFAULT NULL
        COMMENT '需采购数量（需求量 - 可用库存，最小为0）';


-- ======================================================================
-- Part 5：物料对账表补充字段
-- ======================================================================
ALTER TABLE `t_material_reconciliation`
    ADD COLUMN IF NOT EXISTS `source_type`              VARCHAR(20)  DEFAULT NULL
        COMMENT '采购类型: order=批量订单, sample=样衣开发',
    ADD COLUMN IF NOT EXISTS `pattern_production_id`    VARCHAR(36)  DEFAULT NULL
        COMMENT '样衣生产ID（source_type=sample时使用）',
    ADD COLUMN IF NOT EXISTS `expected_arrival_date`    DATETIME     DEFAULT NULL
        COMMENT '预计到货日期',
    ADD COLUMN IF NOT EXISTS `actual_arrival_date`      DATETIME     DEFAULT NULL
        COMMENT '实际到货日期',
    ADD COLUMN IF NOT EXISTS `inbound_date`             DATETIME     DEFAULT NULL
        COMMENT '入库日期',
    ADD COLUMN IF NOT EXISTS `warehouse_location`       VARCHAR(100) DEFAULT NULL
        COMMENT '仓库库区';


-- ======================================================================
-- Part 6：各业务表操作人/创建人字段（全系统统一）
-- ======================================================================

-- t_material_purchase 创建人/更新人
ALTER TABLE `t_material_purchase`
    ADD COLUMN IF NOT EXISTS `creator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN IF NOT EXISTS `creator_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN IF NOT EXISTS `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT '更新人ID',
    ADD COLUMN IF NOT EXISTS `updater_name` VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名';
CREATE INDEX IF NOT EXISTS `idx_mpu_creator_id` ON `t_material_purchase` (`creator_id`);

-- t_product_outstock 出库操作人/创建人
ALTER TABLE `t_product_outstock`
    ADD COLUMN IF NOT EXISTS `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '出库操作人ID',
    ADD COLUMN IF NOT EXISTS `operator_name` VARCHAR(100) DEFAULT NULL COMMENT '出库操作人姓名',
    ADD COLUMN IF NOT EXISTS `creator_id`    VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN IF NOT EXISTS `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名';
CREATE INDEX IF NOT EXISTS `idx_pos_operator_id` ON `t_product_outstock` (`operator_id`);
CREATE INDEX IF NOT EXISTS `idx_pos_creator_id`  ON `t_product_outstock` (`creator_id`);

-- t_cutting_bundle 创建人/操作人
ALTER TABLE `t_cutting_bundle`
    ADD COLUMN IF NOT EXISTS `creator_id`    VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN IF NOT EXISTS `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN IF NOT EXISTS `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '最后扫码操作人ID',
    ADD COLUMN IF NOT EXISTS `operator_name` VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名';
CREATE INDEX IF NOT EXISTS `idx_cb_creator_id`  ON `t_cutting_bundle` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_cb_operator_id` ON `t_cutting_bundle` (`operator_id`);

-- t_style_quotation 创建/更新/审核人
ALTER TABLE `t_style_quotation`
    ADD COLUMN IF NOT EXISTS `creator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN IF NOT EXISTS `creator_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN IF NOT EXISTS `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT '更新人ID',
    ADD COLUMN IF NOT EXISTS `updater_name` VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名',
    ADD COLUMN IF NOT EXISTS `auditor_id`   VARCHAR(32)  DEFAULT NULL COMMENT '审核人ID',
    ADD COLUMN IF NOT EXISTS `auditor_name` VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    ADD COLUMN IF NOT EXISTS `audit_time`   DATETIME     DEFAULT NULL COMMENT '审核时间';
CREATE INDEX IF NOT EXISTS `idx_sq_creator_id` ON `t_style_quotation` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_sq_auditor_id` ON `t_style_quotation` (`auditor_id`);

-- t_payroll_settlement 审核/确认人
ALTER TABLE `t_payroll_settlement`
    ADD COLUMN IF NOT EXISTS `auditor_id`    VARCHAR(32)  DEFAULT NULL COMMENT '审核人ID',
    ADD COLUMN IF NOT EXISTS `auditor_name`  VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    ADD COLUMN IF NOT EXISTS `audit_time`    DATETIME     DEFAULT NULL COMMENT '审核时间',
    ADD COLUMN IF NOT EXISTS `confirmer_id`  VARCHAR(32)  DEFAULT NULL COMMENT '确认人ID',
    ADD COLUMN IF NOT EXISTS `confirmer_name` VARCHAR(100) DEFAULT NULL COMMENT '确认人姓名',
    ADD COLUMN IF NOT EXISTS `confirm_time`  DATETIME     DEFAULT NULL COMMENT '确认时间';
CREATE INDEX IF NOT EXISTS `idx_pse_auditor_id`   ON `t_payroll_settlement` (`auditor_id`);
CREATE INDEX IF NOT EXISTS `idx_pse_confirmer_id` ON `t_payroll_settlement` (`confirmer_id`);

-- t_cutting_task 创建/更新人
ALTER TABLE `t_cutting_task`
    ADD COLUMN IF NOT EXISTS `creator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN IF NOT EXISTS `creator_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN IF NOT EXISTS `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT '更新人ID',
    ADD COLUMN IF NOT EXISTS `updater_name` VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名';
CREATE INDEX IF NOT EXISTS `idx_ct_creator_id` ON `t_cutting_task` (`creator_id`);

-- t_secondary_process 创建/领取/操作人
ALTER TABLE `t_secondary_process`
    ADD COLUMN IF NOT EXISTS `creator_id`    VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN IF NOT EXISTS `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN IF NOT EXISTS `assignee_id`   VARCHAR(32)  DEFAULT NULL COMMENT '领取人ID',
    ADD COLUMN IF NOT EXISTS `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '完成操作人ID',
    ADD COLUMN IF NOT EXISTS `operator_name` VARCHAR(100) DEFAULT NULL COMMENT '完成操作人姓名';
CREATE INDEX IF NOT EXISTS `idx_spc_creator_id`  ON `t_secondary_process` (`creator_id`);
CREATE INDEX IF NOT EXISTS `idx_spc_assignee_id` ON `t_secondary_process` (`assignee_id`);

-- t_pattern_production 领取/纸样师傅ID
ALTER TABLE `t_pattern_production`
    ADD COLUMN IF NOT EXISTS `receiver_id`      VARCHAR(32) DEFAULT NULL COMMENT '领取人ID',
    ADD COLUMN IF NOT EXISTS `pattern_maker_id` VARCHAR(32) DEFAULT NULL COMMENT '纸样师傅ID';
CREATE INDEX IF NOT EXISTS `idx_pp_receiver_id`      ON `t_pattern_production` (`receiver_id`);
CREATE INDEX IF NOT EXISTS `idx_pp_pattern_maker_id` ON `t_pattern_production` (`pattern_maker_id`);

-- t_shipment_reconciliation 对账/审核人
ALTER TABLE `t_shipment_reconciliation`
    ADD COLUMN IF NOT EXISTS `reconciliation_operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '对账操作人ID',
    ADD COLUMN IF NOT EXISTS `reconciliation_operator_name` VARCHAR(100) DEFAULT NULL COMMENT '对账操作人姓名',
    ADD COLUMN IF NOT EXISTS `reconciliation_time`          DATETIME     DEFAULT NULL COMMENT '对账时间',
    ADD COLUMN IF NOT EXISTS `auditor_id`                   VARCHAR(32)  DEFAULT NULL COMMENT '审核人ID',
    ADD COLUMN IF NOT EXISTS `auditor_name`                 VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    ADD COLUMN IF NOT EXISTS `audit_time`                   DATETIME     DEFAULT NULL COMMENT '审核时间';
CREATE INDEX IF NOT EXISTS `idx_shr_reconciliation_operator_id` ON `t_shipment_reconciliation` (`reconciliation_operator_id`);
CREATE INDEX IF NOT EXISTS `idx_shr_auditor_id`                 ON `t_shipment_reconciliation` (`auditor_id`);


-- ======================================================================
-- Part 7：生产订单创建人追踪（来自 20260201 脚本）
-- ======================================================================
ALTER TABLE `t_production_order`
    ADD COLUMN IF NOT EXISTS `created_by_id`   VARCHAR(50)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN IF NOT EXISTS `created_by_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名';

CREATE INDEX IF NOT EXISTS `idx_po_created_by_id` ON `t_production_order` (`created_by_id`);

-- 为已有数据设置默认创建人标记（只对 NULL 记录执行，幂等）
UPDATE `t_production_order`
SET `created_by_id`   = 'system_migration',
    `created_by_name` = '系统迁移'
WHERE `created_by_id` IS NULL;
