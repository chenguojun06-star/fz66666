-- ================================================================
-- 创建订单结算审批付款表
-- ================================================================
-- 用途：订单结算审核通过后，自动创建审批付款记录（按工厂汇总）
-- 流程：订单关闭 → 订单结算(t_shipment_reconciliation) → 审核通过 → 审批付款(本表)
-- ================================================================

-- 创建表
CREATE TABLE IF NOT EXISTS t_order_reconciliation_approval (
    id VARCHAR(32) PRIMARY KEY COMMENT '主键ID',

    -- 工厂信息（按工厂汇总）
    factory_name VARCHAR(100) NOT NULL COMMENT '工厂名称（本厂或加工厂名）',
    is_own_factory TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否本厂(0:加工厂, 1:本厂)',

    -- 汇总数据
    order_count INT DEFAULT 0 COMMENT '订单数量',
    total_quantity INT DEFAULT 0 COMMENT '总件数',
    total_amount DECIMAL(15,2) DEFAULT 0 COMMENT '总金额',

    -- 关联的结算单ID（逗号分隔）
    reconciliation_ids TEXT COMMENT '关联的结算单ID列表（逗号分隔）',

    -- 状态流程
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态(pending:待审核, verified:已验证, approved:已批准, paid:已付款, rejected:已拒绝)',

    -- 审批信息
    approval_time DATETIME COMMENT '批准时间',
    approval_by VARCHAR(50) COMMENT '批准人',

    -- 付款信息
    payment_time DATETIME COMMENT '付款时间',
    payment_by VARCHAR(50) COMMENT '付款人',
    payment_method VARCHAR(50) COMMENT '付款方式（银行转账/现金/微信/支付宝）',

    -- 重审信息
    re_review_time DATETIME COMMENT '重审时间',
    re_review_reason TEXT COMMENT '重审原因',

    -- 备注
    remark TEXT COMMENT '备注',

    -- 时间戳
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(50) COMMENT '创建人',
    update_by VARCHAR(50) COMMENT '更新人',

    -- 索引
    INDEX idx_factory_name (factory_name),
    INDEX idx_status (status),
    INDEX idx_is_own_factory (is_own_factory),
    INDEX idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单结算审批付款表';

-- 初始化说明
SELECT
    '订单结算审批付款表创建成功！' AS message,
    '流程：订单关闭 → 订单结算审核通过 → 自动创建审批付款（按工厂汇总）' AS flow;
