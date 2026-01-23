-- ===========================================================
-- 工资结算表（简化版）
-- ===========================================================
-- 用途: Phase 5扫码数据的财务审批和支付
-- 说明: 仅添加必要字段，复用ScanRecord中的processUnitPrice
-- ===========================================================

-- 表1: t_payroll_settlement_data（结算数据汇总，来自ScanRecord）
CREATE TABLE IF NOT EXISTS t_payroll_settlement_data (
    id VARCHAR(36) PRIMARY KEY COMMENT 'ID',
    factory_id VARCHAR(36) NOT NULL COMMENT '工厂ID',
    factory_name VARCHAR(100) COMMENT '工厂名称',
    process_name VARCHAR(50) COMMENT '工序名称',
    quantity INT COMMENT '完成数量',
    unit_price DECIMAL(10, 2) COMMENT '工序单价',
    total_cost DECIMAL(15, 2) COMMENT '小计',
    settlement_period VARCHAR(20) COMMENT '结算周期',
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态: pending(待审), approved(已审)',
    approved_by VARCHAR(100) COMMENT '审批人',
    approved_at DATETIME COMMENT '审批时间',
    approval_remark VARCHAR(500) COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_factory (factory_id),
    KEY idx_period (settlement_period),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='结算数据汇总表';

-- 表2: t_payroll_settlement（结算单）
CREATE TABLE IF NOT EXISTS t_payroll_settlement (
    id VARCHAR(36) PRIMARY KEY COMMENT 'ID',
    settlement_no VARCHAR(50) UNIQUE COMMENT '结算单号',
    settlement_period VARCHAR(20) COMMENT '结算周期',
    factory_id VARCHAR(36) COMMENT '工厂ID',
    factory_name VARCHAR(100) COMMENT '工厂名称',
    total_amount DECIMAL(15, 2) COMMENT '应付金额',
    approved_amount DECIMAL(15, 2) COMMENT '实付金额',
    status VARCHAR(20) DEFAULT 'submitted' COMMENT '状态: submitted(待审)/approved(已审)/completed(已支付)',
    submitted_at DATETIME COMMENT '提交时间',
    approved_by VARCHAR(100) COMMENT '审批人',
    approved_at DATETIME COMMENT '审批时间',
    payment_method VARCHAR(20) COMMENT '支付方式',
    payment_date DATETIME COMMENT '支付时间',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_period (settlement_period),
    KEY idx_status (status),
    KEY idx_factory (factory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工资结算单表';

-- 表3: t_payment_record（支付记录）
CREATE TABLE IF NOT EXISTS t_payment_record (
    id VARCHAR(36) PRIMARY KEY COMMENT 'ID',
    settlement_id VARCHAR(36) COMMENT '结算单ID',
    settlement_no VARCHAR(50) COMMENT '结算单号',
    payment_amount DECIMAL(15, 2) COMMENT '支付金额',
    payment_method VARCHAR(20) COMMENT '支付方式',
    payment_status VARCHAR(20) DEFAULT 'completed' COMMENT '支付状态',
    payment_date DATETIME COMMENT '支付时间',
    payment_by VARCHAR(100) COMMENT '支付人',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    KEY idx_settlement (settlement_id),
    KEY idx_payment_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付记录表';

-- ===========================================================
-- 权限配置（需要在t_role_permission中添加）
-- ===========================================================

INSERT INTO t_role_permission (role_code, permission_code, permission_name)
SELECT 'FINANCE', 'FINANCE_VIEW', '财务查看' WHERE NOT EXISTS (
    SELECT 1 FROM t_role_permission WHERE role_code = 'FINANCE' AND permission_code = 'FINANCE_VIEW'
);

INSERT INTO t_role_permission (role_code, permission_code, permission_name)
SELECT 'FINANCE', 'FINANCE_APPROVAL', '财务审批' WHERE NOT EXISTS (
    SELECT 1 FROM t_role_permission WHERE role_code = 'FINANCE' AND permission_code = 'FINANCE_APPROVAL'
);

INSERT INTO t_role_permission (role_code, permission_code, permission_name)
SELECT 'FINANCE', 'PAYMENT_EXECUTE', '支付执行' WHERE NOT EXISTS (
    SELECT 1 FROM t_role_permission WHERE role_code = 'FINANCE' AND permission_code = 'PAYMENT_EXECUTE'
);

-- ===========================================================
-- 验证脚本
-- ===========================================================

-- 检查表是否存在
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'fashion_supplychain' 
AND TABLE_NAME IN ('t_payroll_settlement_data', 't_payroll_settlement', 't_payment_record');
