-- ============================================
-- 工资支付系统 - 数据库表定义
-- 版本: V20260217
-- 说明: 支持员工/工厂收款账户管理 + 工资支付记录
-- ============================================

-- 1. 收款账户表（员工/工厂绑定的收款方式）
CREATE TABLE IF NOT EXISTS t_payment_account (
    id VARCHAR(64) NOT NULL COMMENT '主键UUID',
    owner_type VARCHAR(20) NOT NULL COMMENT '账户所有者类型: WORKER=员工, FACTORY=工厂',
    owner_id VARCHAR(64) NOT NULL COMMENT '所有者ID（关联t_user.id或t_factory.id）',
    owner_name VARCHAR(100) DEFAULT NULL COMMENT '所有者名称（冗余，便于查询）',
    account_type VARCHAR(20) NOT NULL COMMENT '账户类型: BANK=银行卡, WECHAT=微信, ALIPAY=支付宝',
    account_name VARCHAR(100) DEFAULT NULL COMMENT '收款户名',
    account_no VARCHAR(100) DEFAULT NULL COMMENT '银行卡号（银行卡类型必填）',
    bank_name VARCHAR(100) DEFAULT NULL COMMENT '开户银行（银行卡类型必填）',
    bank_branch VARCHAR(200) DEFAULT NULL COMMENT '开户支行',
    qr_code_url VARCHAR(500) DEFAULT NULL COMMENT '收款二维码图片URL（微信/支付宝）',
    is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认账户: 0=否, 1=是',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态: active=启用, inactive=停用',
    tenant_id BIGINT DEFAULT NULL COMMENT '租户ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    PRIMARY KEY (id),
    INDEX idx_owner (owner_type, owner_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_type (account_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='收款账户表';

-- 2. 工资支付记录表（每次支付的完整记录）
CREATE TABLE IF NOT EXISTS t_wage_payment (
    id VARCHAR(64) NOT NULL COMMENT '主键UUID',
    payment_no VARCHAR(50) NOT NULL COMMENT '支付单号（WP+日期+序号）',
    payee_type VARCHAR(20) NOT NULL COMMENT '收款方类型: WORKER=员工, FACTORY=工厂',
    payee_id VARCHAR(64) NOT NULL COMMENT '收款方ID',
    payee_name VARCHAR(100) DEFAULT NULL COMMENT '收款方名称',
    payment_account_id VARCHAR(64) DEFAULT NULL COMMENT '关联的收款账户ID',
    payment_method VARCHAR(20) NOT NULL COMMENT '支付方式: OFFLINE=线下, BANK=银行卡, WECHAT=微信, ALIPAY=支付宝',
    amount DECIMAL(12,2) NOT NULL COMMENT '支付金额',
    currency VARCHAR(10) DEFAULT 'CNY' COMMENT '币种',

    -- 业务关联
    biz_type VARCHAR(30) DEFAULT NULL COMMENT '业务类型: PAYROLL=工资, RECONCILIATION=对账结算, REIMBURSEMENT=报销',
    biz_id VARCHAR(64) DEFAULT NULL COMMENT '关联业务ID（工资单/对账单/报销单）',
    biz_no VARCHAR(50) DEFAULT NULL COMMENT '关联业务单号',

    -- 支付信息
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态: pending=待支付, processing=支付中, success=已支付, failed=支付失败, cancelled=已取消',
    payment_time DATETIME DEFAULT NULL COMMENT '实际支付时间',
    payment_proof VARCHAR(500) DEFAULT NULL COMMENT '支付凭证图片URL',
    payment_remark VARCHAR(500) DEFAULT NULL COMMENT '支付备注',

    -- 线上支付信息
    third_party_order_id VARCHAR(100) DEFAULT NULL COMMENT '第三方支付单号',
    third_party_status VARCHAR(50) DEFAULT NULL COMMENT '第三方支付状态',

    -- 操作信息
    operator_id VARCHAR(64) DEFAULT NULL COMMENT '操作人ID',
    operator_name VARCHAR(100) DEFAULT NULL COMMENT '操作人名称',
    confirm_time DATETIME DEFAULT NULL COMMENT '确认收款时间',
    confirm_by VARCHAR(64) DEFAULT NULL COMMENT '确认人（收款方确认）',

    -- 通知信息
    notify_status VARCHAR(20) DEFAULT 'pending' COMMENT '通知状态: pending=待通知, sent=已通知, failed=通知失败',
    notify_time DATETIME DEFAULT NULL COMMENT '通知时间',

    tenant_id BIGINT DEFAULT NULL COMMENT '租户ID',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    PRIMARY KEY (id),
    UNIQUE INDEX uk_payment_no (payment_no),
    INDEX idx_payee (payee_type, payee_id),
    INDEX idx_biz (biz_type, biz_id),
    INDEX idx_status (status),
    INDEX idx_tenant (tenant_id),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工资支付记录表';
