-- ======================== PART 2/6 - 第2段 共4段 ========================

-- ---- V20260222c: billing cycle ----
-- ==================================================================
-- 支持月付/年付计费周期（幂等：跳过已存在的列）
-- ==================================================================

-- 1. 给 t_tenant 增加计费周期字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='billing_cycle');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT ''MONTHLY'' COMMENT ''计费周期: MONTHLY/YEARLY'' AFTER storage_used_mb');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. 给 t_tenant_billing_record 增加计费周期字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='billing_cycle');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN billing_cycle VARCHAR(10) NOT NULL DEFAULT ''MONTHLY'' COMMENT ''计费周期: MONTHLY/YEARLY'' AFTER plan_type');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;



-- ---- V20260222d: add tenant app permission ----
-- ============================================================
-- 新增 MENU_TENANT_APP 权限码（API对接管理菜单）
-- 该菜单归属系统设置分组，租户主账号和有权限的角色可见
-- 日期：2026-02-22
-- ============================================================

-- 新增 API对接管理 菜单权限（parent_id=5 即系统设置分组）
INSERT INTO t_permission (permission_name, permission_code, permission_type, parent_id, status)
SELECT 'API对接管理', 'MENU_TENANT_APP', 'menu', 5, 'ENABLED'
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE permission_code = 'MENU_TENANT_APP');



-- ---- V20260222e: user feedback ----
-- =============================================
-- 用户问题反馈表
-- 小程序和PC端双端提交，超管在客户管理页面查看
-- =============================================

CREATE TABLE IF NOT EXISTS `t_user_feedback` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`     BIGINT       NULL     COMMENT '租户ID',
  `user_id`       BIGINT       NULL     COMMENT '提交人ID',
  `user_name`     VARCHAR(100) NULL     COMMENT '提交人姓名',
  `tenant_name`   VARCHAR(200) NULL     COMMENT '租户名称（冗余，方便查询）',
  `source`        VARCHAR(20)  NOT NULL DEFAULT 'PC' COMMENT '来源：PC / MINIPROGRAM',
  `category`      VARCHAR(50)  NOT NULL DEFAULT 'BUG' COMMENT '分类：BUG / SUGGESTION / QUESTION / OTHER',
  `title`         VARCHAR(200) NOT NULL COMMENT '标题',
  `content`       TEXT         NOT NULL COMMENT '详细描述',
  `screenshot_urls` TEXT       NULL     COMMENT '截图URL（JSON数组）',
  `contact`       VARCHAR(100) NULL     COMMENT '联系方式（选填）',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING / PROCESSING / RESOLVED / CLOSED',
  `reply`         TEXT         NULL     COMMENT '管理员回复',
  `reply_time`    DATETIME     NULL     COMMENT '回复时间',
  `reply_user_id` BIGINT       NULL     COMMENT '回复人ID',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户问题反馈';



-- ---- V20260223: unit price audit and pattern version ----
-- ======================================================================
-- 单价审计日志 + 纸样版本管理 (来自错误放置的 db/V2026012101 文件)
-- 原文件位于 db/ 根目录，Flyway 未能识别，本文件将其正式纳入迁移管理
-- 日期：2026-02-23
-- ======================================================================

-- 1. 单价修改审计日志表
CREATE TABLE IF NOT EXISTS `t_unit_price_audit_log` (
    `id`            VARCHAR(36)   NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_no`      VARCHAR(50)   NOT NULL COMMENT '款号',
    `process_name`  VARCHAR(50)   NOT NULL COMMENT '工序名称',
    `old_price`     DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改前单价',
    `new_price`     DECIMAL(10,2) DEFAULT 0.00 COMMENT '修改后单价',
    `change_source` VARCHAR(30)   NOT NULL COMMENT '变更来源: template/scan/reconciliation',
    `related_id`    VARCHAR(36)   DEFAULT NULL COMMENT '关联ID',
    `operator`      VARCHAR(50)   DEFAULT NULL COMMENT '操作人',
    `create_time`   DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `remark`        VARCHAR(200)  DEFAULT NULL COMMENT '备注',
    INDEX `idx_style_no`    (`style_no`),
    INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='单价修改审计日志表';

-- 2. 为款号附件表添加版本管理字段（ADD COLUMN 保证幂等）
ALTER TABLE `t_style_attachment`
    ADD COLUMN `biz_type`       VARCHAR(30)  DEFAULT 'general'
        COMMENT '业务类型: general/pattern/pattern_grading/workorder',
    ADD COLUMN `version`        INT          DEFAULT 1
        COMMENT '版本号',
    ADD COLUMN `version_remark` VARCHAR(200) DEFAULT NULL
        COMMENT '版本说明',
    ADD COLUMN `status`         VARCHAR(20)  DEFAULT 'active'
        COMMENT '状态: active/archived',
    ADD COLUMN `uploader`       VARCHAR(50)  DEFAULT NULL
        COMMENT '上传人',
    ADD COLUMN `parent_id`      VARCHAR(36)  DEFAULT NULL
        COMMENT '父版本ID';

CALL _add_idx('t_style_attachment', 'idx_style_attachment_biz_type', 'INDEX `idx_style_attachment_biz_type` (`biz_type`)');
CALL _add_idx('t_style_attachment', 'idx_style_attachment_status', 'INDEX `idx_style_attachment_status` (`status`)');

-- 3. 纸样检查配置表
CREATE TABLE IF NOT EXISTS `t_pattern_check_config` (
    `id`                    VARCHAR(36) NOT NULL PRIMARY KEY COMMENT '主键ID',
    `style_no`              VARCHAR(50) NOT NULL COMMENT '款号',
    `require_pattern`       TINYINT     DEFAULT 1 COMMENT '是否需要纸样',
    `require_grading`       TINYINT     DEFAULT 1 COMMENT '是否需要放码文件',
    `require_marker`        TINYINT     DEFAULT 0 COMMENT '是否需要排料图',
    `check_on_order_create` TINYINT     DEFAULT 1 COMMENT '创建订单时检查',
    `check_on_cutting`      TINYINT     DEFAULT 1 COMMENT '裁剪时检查',
    `create_time`           DATETIME    DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uk_style_no` (`style_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='纸样检查配置表';

-- 4. 为款号信息表添加纸样相关字段
ALTER TABLE `t_style_info`
    ADD COLUMN `pattern_status`       VARCHAR(20) DEFAULT 'pending'
        COMMENT '纸样状态: pending/in_progress/completed',
    ADD COLUMN `pattern_started_at`   DATETIME DEFAULT NULL
        COMMENT '纸样开始时间',
    ADD COLUMN `pattern_completed_at` DATETIME DEFAULT NULL
        COMMENT '纸样完成时间',
    ADD COLUMN `grading_status`       VARCHAR(20) DEFAULT 'pending'
        COMMENT '放码状态: pending/in_progress/completed',
    ADD COLUMN `grading_completed_at` DATETIME DEFAULT NULL
        COMMENT '放码完成时间';



-- ---- V20260223b: remaining tables and operator fields ----
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
    ADD COLUMN `inbound_record_id` VARCHAR(32) DEFAULT NULL
    COMMENT '最新入库单ID';
CALL _add_idx('t_material_purchase', 'idx_mpu_inbound_record_id', 'INDEX `idx_mpu_inbound_record_id` (`inbound_record_id`)');


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
    ADD COLUMN `stock_status`      VARCHAR(20) DEFAULT NULL
        COMMENT '库存状态: sufficient/insufficient/none/unchecked',
    ADD COLUMN `available_stock`   INT         DEFAULT NULL
        COMMENT '可用库存（quantity - locked_quantity）',
    ADD COLUMN `required_purchase` INT         DEFAULT NULL
        COMMENT '需采购数量（需求量 - 可用库存，最小为0）';


-- ======================================================================
-- Part 5：物料对账表补充字段
-- ======================================================================
ALTER TABLE `t_material_reconciliation`
    ADD COLUMN `source_type`              VARCHAR(20)  DEFAULT NULL
        COMMENT '采购类型: order=批量订单, sample=样衣开发',
    ADD COLUMN `pattern_production_id`    VARCHAR(36)  DEFAULT NULL
        COMMENT '样衣生产ID（source_type=sample时使用）',
    ADD COLUMN `expected_arrival_date`    DATETIME     DEFAULT NULL
        COMMENT '预计到货日期',
    ADD COLUMN `actual_arrival_date`      DATETIME     DEFAULT NULL
        COMMENT '实际到货日期',
    ADD COLUMN `inbound_date`             DATETIME     DEFAULT NULL
        COMMENT '入库日期',
    ADD COLUMN `warehouse_location`       VARCHAR(100) DEFAULT NULL
        COMMENT '仓库库区';


-- ======================================================================
-- Part 6：各业务表操作人/创建人字段（全系统统一）
-- ======================================================================

-- t_material_purchase 创建人/更新人
ALTER TABLE `t_material_purchase`
    ADD COLUMN `creator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN `creator_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT '更新人ID',
    ADD COLUMN `updater_name` VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名';
CALL _add_idx('t_material_purchase', 'idx_mpu_creator_id', 'INDEX `idx_mpu_creator_id` (`creator_id`)');

-- t_product_outstock 出库操作人/创建人
ALTER TABLE `t_product_outstock`
    ADD COLUMN `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '出库操作人ID',
    ADD COLUMN `operator_name` VARCHAR(100) DEFAULT NULL COMMENT '出库操作人姓名',
    ADD COLUMN `creator_id`    VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名';
CALL _add_idx('t_product_outstock', 'idx_pos_operator_id', 'INDEX `idx_pos_operator_id` (`operator_id`)');
CALL _add_idx('t_product_outstock', 'idx_pos_creator_id', 'INDEX `idx_pos_creator_id` (`creator_id`)');

-- t_cutting_bundle 创建人/操作人
ALTER TABLE `t_cutting_bundle`
    ADD COLUMN `creator_id`    VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '最后扫码操作人ID',
    ADD COLUMN `operator_name` VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名';
CALL _add_idx('t_cutting_bundle', 'idx_cb_creator_id', 'INDEX `idx_cb_creator_id` (`creator_id`)');
CALL _add_idx('t_cutting_bundle', 'idx_cb_operator_id', 'INDEX `idx_cb_operator_id` (`operator_id`)');

-- t_style_quotation 创建/更新/审核人
ALTER TABLE `t_style_quotation`
    ADD COLUMN `creator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN `creator_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT '更新人ID',
    ADD COLUMN `updater_name` VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名',
    ADD COLUMN `auditor_id`   VARCHAR(32)  DEFAULT NULL COMMENT '审核人ID',
    ADD COLUMN `auditor_name` VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    ADD COLUMN `audit_time`   DATETIME     DEFAULT NULL COMMENT '审核时间';
CALL _add_idx('t_style_quotation', 'idx_sq_creator_id', 'INDEX `idx_sq_creator_id` (`creator_id`)');
CALL _add_idx('t_style_quotation', 'idx_sq_auditor_id', 'INDEX `idx_sq_auditor_id` (`auditor_id`)');

-- t_payroll_settlement 审核/确认人
ALTER TABLE `t_payroll_settlement`
    ADD COLUMN `auditor_id`    VARCHAR(32)  DEFAULT NULL COMMENT '审核人ID',
    ADD COLUMN `auditor_name`  VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    ADD COLUMN `audit_time`    DATETIME     DEFAULT NULL COMMENT '审核时间',
    ADD COLUMN `confirmer_id`  VARCHAR(32)  DEFAULT NULL COMMENT '确认人ID',
    ADD COLUMN `confirmer_name` VARCHAR(100) DEFAULT NULL COMMENT '确认人姓名',
    ADD COLUMN `confirm_time`  DATETIME     DEFAULT NULL COMMENT '确认时间';
CALL _add_idx('t_payroll_settlement', 'idx_pse_auditor_id', 'INDEX `idx_pse_auditor_id` (`auditor_id`)');
CALL _add_idx('t_payroll_settlement', 'idx_pse_confirmer_id', 'INDEX `idx_pse_confirmer_id` (`confirmer_id`)');

-- t_cutting_task 创建/更新人
ALTER TABLE `t_cutting_task`
    ADD COLUMN `creator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN `creator_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN `updater_id`   VARCHAR(32)  DEFAULT NULL COMMENT '更新人ID',
    ADD COLUMN `updater_name` VARCHAR(100) DEFAULT NULL COMMENT '更新人姓名';
CALL _add_idx('t_cutting_task', 'idx_ct_creator_id', 'INDEX `idx_ct_creator_id` (`creator_id`)');

-- t_secondary_process 创建/领取/操作人
ALTER TABLE `t_secondary_process`
    ADD COLUMN `creator_id`    VARCHAR(32)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN `creator_name`  VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名',
    ADD COLUMN `assignee_id`   VARCHAR(32)  DEFAULT NULL COMMENT '领取人ID',
    ADD COLUMN `operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '完成操作人ID',
    ADD COLUMN `operator_name` VARCHAR(100) DEFAULT NULL COMMENT '完成操作人姓名';
CALL _add_idx('t_secondary_process', 'idx_spc_creator_id', 'INDEX `idx_spc_creator_id` (`creator_id`)');
CALL _add_idx('t_secondary_process', 'idx_spc_assignee_id', 'INDEX `idx_spc_assignee_id` (`assignee_id`)');

-- t_pattern_production 领取/纸样师傅ID
ALTER TABLE `t_pattern_production`
    ADD COLUMN `receiver_id`      VARCHAR(32) DEFAULT NULL COMMENT '领取人ID',
    ADD COLUMN `pattern_maker_id` VARCHAR(32) DEFAULT NULL COMMENT '纸样师傅ID';
CALL _add_idx('t_pattern_production', 'idx_pp_receiver_id', 'INDEX `idx_pp_receiver_id` (`receiver_id`)');
CALL _add_idx('t_pattern_production', 'idx_pp_pattern_maker_id', 'INDEX `idx_pp_pattern_maker_id` (`pattern_maker_id`)');

-- t_shipment_reconciliation 对账/审核人
ALTER TABLE `t_shipment_reconciliation`
    ADD COLUMN `reconciliation_operator_id`   VARCHAR(32)  DEFAULT NULL COMMENT '对账操作人ID',
    ADD COLUMN `reconciliation_operator_name` VARCHAR(100) DEFAULT NULL COMMENT '对账操作人姓名',
    ADD COLUMN `reconciliation_time`          DATETIME     DEFAULT NULL COMMENT '对账时间',
    ADD COLUMN `auditor_id`                   VARCHAR(32)  DEFAULT NULL COMMENT '审核人ID',
    ADD COLUMN `auditor_name`                 VARCHAR(100) DEFAULT NULL COMMENT '审核人姓名',
    ADD COLUMN `audit_time`                   DATETIME     DEFAULT NULL COMMENT '审核时间';
CALL _add_idx('t_shipment_reconciliation', 'idx_shr_reconciliation_operator_id', 'INDEX `idx_shr_reconciliation_operator_id` (`reconciliation_operator_id`)');
CALL _add_idx('t_shipment_reconciliation', 'idx_shr_auditor_id', 'INDEX `idx_shr_auditor_id` (`auditor_id`)');


-- ======================================================================
-- Part 7：生产订单创建人追踪（来自 20260201 脚本）
-- ======================================================================
ALTER TABLE `t_production_order`
    ADD COLUMN `created_by_id`   VARCHAR(50)  DEFAULT NULL COMMENT '创建人ID',
    ADD COLUMN `created_by_name` VARCHAR(100) DEFAULT NULL COMMENT '创建人姓名';

CALL _add_idx('t_production_order', 'idx_po_created_by_id', 'INDEX `idx_po_created_by_id` (`created_by_id`)');

-- 为已有数据设置默认创建人标记（只对 NULL 记录执行，幂等）
UPDATE `t_production_order`
SET `created_by_id`   = 'system_migration',
    `created_by_name` = '系统迁移'
WHERE `created_by_id` IS NULL;



-- ---- V20260223c: add payment approval permissions ----
-- 添加付款审批管理和查看权限
-- WagePaymentController 方法级 @PreAuthorize 引用了这两个权限码
-- 如果不存在则插入，避免重复

INSERT IGNORE INTO t_permission (name, code, type, parent_id, status, created_at, updated_at)
SELECT '付款审批管理', 'MENU_FINANCE_PAYROLL_APPROVAL_MANAGE', 'menu',
       (SELECT id FROM (SELECT id FROM t_permission WHERE code = 'MENU_FINANCE') tmp), 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code = 'MENU_FINANCE_PAYROLL_APPROVAL_MANAGE');

INSERT IGNORE INTO t_permission (name, code, type, parent_id, status, created_at, updated_at)
SELECT '待付款查看', 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW', 'menu',
       (SELECT id FROM (SELECT id FROM t_permission WHERE code = 'MENU_FINANCE') tmp), 'active', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM t_permission WHERE code = 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW');

-- 为所有角色模板分配新权限（确保租户主账号可用）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN t_permission p
WHERE p.code IN ('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE', 'MENU_FINANCE_PAYROLL_APPROVAL_VIEW')
  AND r.is_system = 1
  AND NOT EXISTS (
    SELECT 1 FROM t_role_permission rp WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );



-- ---- V20260223d: billing invoice and tenant self service ----
-- ============================================================
-- V20260223d: 账单发票字段 + 租户开票信息
-- 1. t_tenant_billing_record 增加发票相关字段
-- 2. t_tenant 增加默认开票信息（租户自助维护）
-- ============================================================

-- 1. 账单增加发票字段
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_required');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_required TINYINT DEFAULT 0 COMMENT ''是否需要发票'' AFTER remark');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_status');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_status VARCHAR(20) DEFAULT ''NOT_REQUIRED'' COMMENT ''发票状态: NOT_REQUIRED/PENDING/ISSUED/MAILED'' AFTER invoice_required');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_title');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_title VARCHAR(200) DEFAULT NULL COMMENT ''发票抬头'' AFTER invoice_status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_tax_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_tax_no VARCHAR(50) DEFAULT NULL COMMENT ''纳税人识别号'' AFTER invoice_title');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_no VARCHAR(50) DEFAULT NULL COMMENT ''发票号码'' AFTER invoice_tax_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_amount');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_amount DECIMAL(12,2) DEFAULT NULL COMMENT ''发票金额'' AFTER invoice_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_issued_time');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_issued_time DATETIME DEFAULT NULL COMMENT ''开票时间'' AFTER invoice_amount');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_bank_name');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_bank_name VARCHAR(100) DEFAULT NULL COMMENT ''开户银行'' AFTER invoice_issued_time');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_bank_account');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_bank_account VARCHAR(50) DEFAULT NULL COMMENT ''银行账号'' AFTER invoice_bank_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_address');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_address VARCHAR(200) DEFAULT NULL COMMENT ''注册地址'' AFTER invoice_bank_account');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_phone');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant_billing_record ADD COLUMN invoice_phone VARCHAR(30) DEFAULT NULL COMMENT ''注册电话'' AFTER invoice_address');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. t_tenant 增加默认开票信息（租户可自助维护，生成账单时自动填充）
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_title');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_title VARCHAR(200) DEFAULT NULL COMMENT ''默认发票抬头'' AFTER contact_phone');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_tax_no');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_tax_no VARCHAR(50) DEFAULT NULL COMMENT ''默认纳税人识别号'' AFTER invoice_title');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_name');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_bank_name VARCHAR(100) DEFAULT NULL COMMENT ''开户银行'' AFTER invoice_tax_no');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_account');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_bank_account VARCHAR(50) DEFAULT NULL COMMENT ''银行账号'' AFTER invoice_bank_name');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_address');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_address VARCHAR(200) DEFAULT NULL COMMENT ''注册地址'' AFTER invoice_bank_account');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_phone');
SET @sql = IF(@col>0, 'SELECT 1', 'ALTER TABLE t_tenant ADD COLUMN invoice_phone VARCHAR(30) DEFAULT NULL COMMENT ''注册电话'' AFTER invoice_address');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;



-- ---- V20260224: add data import permission ----
-- 添加数据导入菜单权限
INSERT INTO t_permission (permission_code, permission_name, permission_type, description, create_time, update_time)
SELECT 'MENU_DATA_IMPORT', '数据导入', 'MENU', 'Excel批量导入基础数据（款式、供应商、员工、工序）', NOW(), NOW()
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1 FROM t_permission WHERE permission_code = 'MENU_DATA_IMPORT'
);

-- 为所有租户主账号角色分配数据导入权限（租户主账号=租户内最高权限）
INSERT IGNORE INTO t_role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM t_role r
CROSS JOIN (SELECT id FROM t_permission WHERE permission_code = 'MENU_DATA_IMPORT') p
WHERE r.role_name = 'tenant_owner';



-- ---- V20260225: add user avatar url ----
-- 给 t_user 表添加头像 URL 字段
ALTER TABLE t_user ADD COLUMN avatar_url VARCHAR(500) DEFAULT NULL COMMENT '用户头像URL（COS存储路径）';



-- ---- V2026022601: sync flow stage view latest ----
-- V2026022601: 同步 v_production_order_flow_stage_snapshot 视图至最新定义
-- 原因: V2026022201 的视图定义已落后于 ViewMigrator 内联 SQL：
--   1. ironing_* 列原来只匹配 '%大烫%/%整烫%/%烫%'，现改为「尾部」父节点聚合
--   2. packaging_* 列原来只匹配 '%包装%'，现改为「尾部」父节点聚合（与 ironing_* 值相同）
--   3. car_sewing_* 列增加 progress_stage IN ('carSewing','car_sewing','车缝') 匹配
-- 此迁移确保生产环境（FASHION_DB_INITIALIZER_ENABLED=false）也能用到最新视图

CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS
SELECT
  sr.order_id AS order_id,
  sr.tenant_id AS tenant_id,
  MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS order_operator_name,
  MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS procurement_scan_operator_name,
  MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time,
  MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS cutting_operator_name,
  SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS cutting_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN sr.scan_time END) AS sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单', '采购')
        AND IFNULL(sr.process_code, '') <> 'quality_warehousing'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%'
        AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%'
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS sewing_operator_name,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN sr.scan_time END) AS car_sewing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN sr.scan_time END) AS car_sewing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS car_sewing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('carSewing', 'car_sewing', '车缝')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS car_sewing_quantity,
  -- ★ ironing_* 列实际存「尾部」父节点聚合（大烫/整烫/剪线/包装/尾工均归尾部）
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS ironing_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS ironing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS ironing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS ironing_quantity,
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN sr.scan_time END) AS secondary_process_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN sr.scan_time END) AS secondary_process_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS secondary_process_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('secondaryProcess', 'secondary_process', '二次工艺')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%'
             OR TRIM(sr.process_name) LIKE '%绣花%'
             OR TRIM(sr.process_name) LIKE '%印花%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS secondary_process_quantity,
  -- ★ packaging_* 列实际存「尾部」父节点聚合（与 ironing_* 值相同）
  MIN(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS packaging_start_time,
  MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN sr.scan_time END) AS packaging_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS packaging_operator_name,
  SUM(CASE WHEN sr.scan_type = 'production'
        AND (sr.progress_stage IN ('尾部', 'ironing', 'packaging', 'tailProcess', 'tail_process')
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%'
             OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS packaging_quantity,
  MIN(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_start_time,
  MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN sr.scan_time END) AS quality_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS quality_operator_name,
  SUM(CASE WHEN (sr.scan_type = 'quality'
        OR IFNULL(sr.process_code, '') = 'quality_warehousing'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%'
        OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%')
      THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS quality_quantity,
  MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time,
  MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time,
  SUBSTRING_INDEX(
    MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time), 20, '0'), LPAD(UNIX_TIMESTAMP(sr.create_time), 20, '0'), '|', IFNULL(sr.operator_name, '')) END),
    '|', -1
  ) AS warehousing_operator_name,
  SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code, '') <> 'warehouse_rollback' THEN IFNULL(sr.quantity, 0) ELSE 0 END) AS warehousing_quantity
FROM t_scan_record sr
WHERE sr.scan_result = 'success'
GROUP BY sr.order_id, sr.tenant_id;

