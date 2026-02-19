-- 费用报销表
-- 用于记录员工日常费用报销（打车、出差、面辅料垫付等）
-- 审批流程：pending(待审批) → approved(已批准) → paid(已付款)
--                ↓
--           rejected(已驳回) → pending(重新提交)

CREATE TABLE IF NOT EXISTS `t_expense_reimbursement` (
  `id` varchar(64) NOT NULL COMMENT '主键UUID',
  `reimbursement_no` varchar(64) NOT NULL COMMENT '报销单号（自动生成 EX+日期+序号）',
  `applicant_id` bigint NOT NULL COMMENT '申请人ID（关联t_user.id）',
  `applicant_name` varchar(64) NOT NULL COMMENT '申请人姓名',

  -- 报销信息
  `expense_type` varchar(32) NOT NULL COMMENT '费用类型：taxi=打车, travel=出差, material_advance=面辅料垫付, office=办公用品, other=其他',
  `title` varchar(200) NOT NULL COMMENT '报销标题/事由',
  `amount` decimal(12,2) NOT NULL COMMENT '报销金额',
  `expense_date` date NOT NULL COMMENT '费用发生日期',
  `description` text COMMENT '详细说明',

  -- 关联信息（可选，面辅料垫付时关联订单）
  `order_no` varchar(64) DEFAULT NULL COMMENT '关联订单号（面辅料垫付时）',
  `supplier_name` varchar(128) DEFAULT NULL COMMENT '供应商名称（面辅料垫付时）',

  -- 收款信息
  `payment_account` varchar(128) DEFAULT NULL COMMENT '收款账号（银行卡/支付宝/微信）',
  `payment_method` varchar(32) DEFAULT 'bank_transfer' COMMENT '付款方式：bank_transfer=银行转账, alipay=支付宝, wechat=微信',
  `account_name` varchar(64) DEFAULT NULL COMMENT '收款户名',
  `bank_name` varchar(128) DEFAULT NULL COMMENT '开户银行',

  -- 附件
  `attachments` text COMMENT '附件URL列表（JSON数组，发票/收据照片）',

  -- 审批流程
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '状态：pending=待审批, approved=已批准, rejected=已驳回, paid=已付款',
  `approver_id` bigint DEFAULT NULL COMMENT '审批人ID',
  `approver_name` varchar(64) DEFAULT NULL COMMENT '审批人姓名',
  `approval_time` datetime DEFAULT NULL COMMENT '审批时间',
  `approval_remark` varchar(500) DEFAULT NULL COMMENT '审批备注/驳回原因',
  `payment_time` datetime DEFAULT NULL COMMENT '付款时间',
  `payment_by` varchar(64) DEFAULT NULL COMMENT '付款操作人',

  -- 审计字段
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `create_by` varchar(64) DEFAULT NULL COMMENT '创建人',
  `update_by` varchar(64) DEFAULT NULL COMMENT '更新人',
  `delete_flag` int NOT NULL DEFAULT 0 COMMENT '删除标记 0=正常 1=已删除',
  `tenant_id` bigint DEFAULT NULL COMMENT '租户ID',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_reimbursement_no` (`reimbursement_no`),
  KEY `idx_applicant_id` (`applicant_id`),
  KEY `idx_status` (`status`),
  KEY `idx_expense_type` (`expense_type`),
  KEY `idx_create_time` (`create_time`),
  KEY `idx_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='费用报销表';
