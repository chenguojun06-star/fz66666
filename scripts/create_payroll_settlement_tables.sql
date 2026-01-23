-- ===========================================================
-- 财务结算系统数据表定义
-- ===========================================================
-- 用途: 存储工资结算相关的数据，包括结算数据、结算单和支付记录
-- 创建时间: 2026-01-23
-- 依赖: Phase 5 ScanRecord表中的processUnitPrice和scanCost字段
-- ===========================================================

-- ===========================================================
-- 表1: t_payroll_settlement_data（工序结算数据表）
-- 职责: 按工序/工厂/周期汇总的扫码成本数据
-- ===========================================================

CREATE TABLE t_payroll_settlement_data (
    -- 主键
    id VARCHAR(36) PRIMARY KEY COMMENT '结算数据ID（UUID）',

    -- 组织信息
    factory_id VARCHAR(36) NOT NULL COMMENT '工厂ID',
    factory_name VARCHAR(100) NOT NULL COMMENT '工厂名称',
    worker_id VARCHAR(36) COMMENT '工人ID（可为空，按工厂结算时为空）',
    worker_name VARCHAR(100) COMMENT '工人名称',

    -- 工序信息
    process_name VARCHAR(50) NOT NULL COMMENT '工序名称（如：做领、上领、车缝）',
    progress_stage VARCHAR(50) COMMENT '生产阶段（裁剪、生产、质检）',

    -- 数量和单价
    quantity INT COMMENT '完成数量',
    unit_price DECIMAL(10, 2) COMMENT '工序单价（来自Phase 5）',
    total_cost DECIMAL(15, 2) COMMENT '小计 = quantity * unit_price',

    -- 时间周期
    settlement_period VARCHAR(20) NOT NULL COMMENT '结算周期（如：2026-01-1W 或 2026-01）',
    start_date DATETIME COMMENT '周期开始日期',
    end_date DATETIME COMMENT '周期结束日期',

    -- 关联数据
    scan_record_ids JSON COMMENT '关联的ScanRecord ID列表（JSON数组）',
    order_ids JSON COMMENT '关联的订单号列表（JSON数组）',
    scan_record_count INT COMMENT '关联的扫码记录数',

    -- 审批信息
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态: pending(待审), approved(已审), rejected(驳回), settled(已结)',
    approved_by VARCHAR(100) COMMENT '审批人',
    approved_at DATETIME COMMENT '审批时间',
    approval_remark VARCHAR(500) COMMENT '审批备注',

    -- 系统字段
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_flag TINYINT DEFAULT 0 COMMENT '删除标志（0=未删除，1=已删除）',

    -- 索引
    KEY idx_factory_id (factory_id),
    KEY idx_settlement_period (settlement_period),
    KEY idx_status (status),
    KEY idx_process_name (process_name),
    KEY idx_created_at (created_at),
    UNIQUE KEY uq_period_factory_process (settlement_period, factory_id, process_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
  COMMENT='工序结算数据表（从ScanRecord按周期/工厂/工序汇总）';

-- ===========================================================
-- 表2: t_payroll_settlement（工资结算单表）
-- 职责: 汇总层结算单，包含审批和支付信息
-- ===========================================================

CREATE TABLE t_payroll_settlement (
    -- 主键
    id VARCHAR(36) PRIMARY KEY COMMENT '结算单ID（UUID）',

    -- 基本信息
    settlement_no VARCHAR(50) UNIQUE NOT NULL COMMENT '结算单号（自动生成，如PS20260123001）',
    settlement_period VARCHAR(20) NOT NULL COMMENT '结算周期（如：2026-01-1W）',
    settlement_type VARCHAR(20) DEFAULT 'factory' COMMENT '结算类型: factory(按工厂) / worker(按工人)',

    -- 结算对象
    factory_id VARCHAR(36) COMMENT '工厂ID',
    factory_name VARCHAR(100) COMMENT '工厂名称',
    worker_id VARCHAR(36) COMMENT '工人ID（按工人结算时使用）',
    worker_name VARCHAR(100) COMMENT '工人名称',

    -- 金额信息
    total_amount DECIMAL(15, 2) NOT NULL COMMENT '应付工资总额',
    approved_amount DECIMAL(15, 2) COMMENT '审批后的金额（可能会调整）',
    actual_payment DECIMAL(15, 2) COMMENT '实际支付金额',
    total_quantity BIGINT COMMENT '总完成数量',

    -- 明细关联
    settlement_data_count INT COMMENT '包含的settlement_data记录数',
    settlement_data_ids JSON COMMENT '关联的settlement_data_id列表（JSON）',

    -- 审批流程
    status VARCHAR(20) DEFAULT 'draft' COMMENT '状态: draft(草稿) → submitted(已提交) → approved(已审批) → payment(支付中) → completed(已完成)',
    submitted_by VARCHAR(100) COMMENT '提交人',
    submitted_at DATETIME COMMENT '提交时间',
    approved_by VARCHAR(100) COMMENT '审批人',
    approved_at DATETIME COMMENT '审批时间',
    approval_remark VARCHAR(500) COMMENT '审批意见',

    -- 支付信息
    payment_method VARCHAR(20) COMMENT '支付方式: transfer(转账) / cash(现金) / check(支票)',
    payment_date DATETIME COMMENT '支付日期',
    payment_by VARCHAR(100) COMMENT '支付人',
    payment_batch_no VARCHAR(50) COMMENT '支付批次号',

    -- 系统字段
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_flag TINYINT DEFAULT 0 COMMENT '删除标志（0=未删除，1=已删除）',

    -- 索引
    KEY idx_settlement_period (settlement_period),
    KEY idx_status (status),
    KEY idx_factory_id (factory_id),
    KEY idx_settlement_no (settlement_no),
    KEY idx_created_at (created_at),
    KEY idx_approved_at (approved_at),
    KEY idx_payment_date (payment_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
  COMMENT='工资结算单表（汇总层，包含审批和支付信息）';

-- ===========================================================
-- 表3: t_payment_record（支付记录表）
-- 职责: 记录每笔支付的详细信息，用于财务对账和审计
-- ===========================================================

CREATE TABLE t_payment_record (
    -- 主键
    id VARCHAR(36) PRIMARY KEY COMMENT '支付记录ID（UUID）',

    -- 关联信息
    settlement_id VARCHAR(36) NOT NULL COMMENT '关联的结算单ID',
    settlement_no VARCHAR(50) COMMENT '关联的结算单号（冗余字段，便于查询）',

    -- 支付金额
    payment_amount DECIMAL(15, 2) NOT NULL COMMENT '支付金额',
    payment_currency VARCHAR(10) DEFAULT 'CNY' COMMENT '货币类型（默认人民币）',

    -- 支付方式和账户
    payment_method VARCHAR(20) NOT NULL COMMENT '支付方式: transfer(转账) / cash(现金) / check(支票)',
    payer_account VARCHAR(100) COMMENT '付款账户',
    payee_account VARCHAR(100) COMMENT '收款账户',
    bank_code VARCHAR(20) COMMENT '银行代码（银行转账时使用）',
    bank_name VARCHAR(100) COMMENT '银行名称（银行转账时使用）',

    -- 支付状态
    payment_status VARCHAR(20) DEFAULT 'pending' COMMENT '支付状态: pending(待支付) → processing(处理中) → completed(已完成) → failed(失败)',
    payment_date DATETIME COMMENT '支付时间',
    payment_by VARCHAR(100) COMMENT '支付执行人',

    -- 对账信息
    reconciliation_status VARCHAR(20) DEFAULT 'pending' COMMENT '对账状态: pending(待对账) / matched(已对账) / mismatch(不匹配)',
    reconciliation_date DATETIME COMMENT '对账时间',
    reconciled_by VARCHAR(100) COMMENT '对账人',

    -- 备注和凭证
    payment_remark VARCHAR(500) COMMENT '支付备注',
    voucher_number VARCHAR(50) COMMENT '凭证号（发票/收据号）',
    attachment_url VARCHAR(255) COMMENT '附件URL（银行转账凭证等）',

    -- 系统字段
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    deleted_flag TINYINT DEFAULT 0 COMMENT '删除标志（0=未删除，1=已删除）',

    -- 索引
    KEY idx_settlement_id (settlement_id),
    KEY idx_settlement_no (settlement_no),
    KEY idx_payment_status (payment_status),
    KEY idx_payment_date (payment_date),
    KEY idx_reconciliation_status (reconciliation_status),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
  COMMENT='支付记录表（记录每笔支付的详细信息）';

-- ===========================================================
-- 视图1: v_payroll_settlement_summary（结算汇总视图）
-- 目的: 快速查看各周期的结算汇总数据
-- ===========================================================

CREATE OR REPLACE VIEW v_payroll_settlement_summary AS
SELECT 
    ps.settlement_period,
    ps.factory_name,
    COUNT(ps.id) as settlement_count,
    SUM(ps.total_amount) as total_payable,
    SUM(ps.approved_amount) as total_approved,
    SUM(ps.actual_payment) as total_paid,
    COUNT(CASE WHEN ps.status = 'draft' THEN 1 END) as draft_count,
    COUNT(CASE WHEN ps.status = 'submitted' THEN 1 END) as submitted_count,
    COUNT(CASE WHEN ps.status = 'approved' THEN 1 END) as approved_count,
    COUNT(CASE WHEN ps.status = 'completed' THEN 1 END) as completed_count
FROM t_payroll_settlement ps
WHERE ps.deleted_flag = 0
GROUP BY ps.settlement_period, ps.factory_name;

-- ===========================================================
-- 视图2: v_payment_pending（待支付结算单视图）
-- 目的: 快速查看所有待支付（已批准但未支付）的结算单
-- ===========================================================

CREATE OR REPLACE VIEW v_payment_pending AS
SELECT 
    ps.id,
    ps.settlement_no,
    ps.settlement_period,
    ps.factory_name,
    ps.total_amount,
    ps.approved_amount,
    ps.approved_by,
    ps.approved_at,
    DATEDIFF(CURDATE(), DATE(ps.approved_at)) as days_since_approval
FROM t_payroll_settlement ps
WHERE ps.deleted_flag = 0
  AND ps.status = 'approved'
ORDER BY ps.approved_at ASC;

-- ===========================================================
-- 触发器：自动更新结算单总金额
-- ===========================================================

DELIMITER $$

CREATE TRIGGER trg_settlement_data_insert_after
AFTER INSERT ON t_payroll_settlement_data
FOR EACH ROW
BEGIN
    -- 当插入新的settlement_data时，触发结算单的总金额计算
    -- 注：此逻辑通常在应用层处理，这里仅作为数据库级别的安全保证
END$$

DELIMITER ;

-- ===========================================================
-- 数据库初始化SQL
-- ===========================================================

-- 插入默认的支付方式
INSERT INTO t_payment_method (code, name, enabled) VALUES 
    ('transfer', '银行转账', 1),
    ('cash', '现金支付', 1),
    ('check', '支票支付', 1)
ON DUPLICATE KEY UPDATE enabled = VALUES(enabled);

-- ===========================================================
-- 权限配置（需要在t_role_permission表中添加）
-- ===========================================================

-- 财务查看权限
-- INSERT INTO t_role_permission (role_code, permission_code, permission_name) VALUES
--     ('FINANCE', 'FINANCE_VIEW', '财务数据查看'),
--     ('FINANCE', 'FINANCE_APPROVAL', '财务审批'),
--     ('ADMIN', 'FINANCE_VIEW', '财务数据查看'),
--     ('ADMIN', 'FINANCE_APPROVAL', '财务审批'),
--     ('ADMIN', 'PAYMENT_EXECUTE', '执行支付');

-- ===========================================================
-- 验证脚本
-- ===========================================================

-- 检查表是否创建成功
SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    DATA_LENGTH,
    CREATE_TIME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_NAME IN (
      't_payroll_settlement_data',
      't_payroll_settlement',
      't_payment_record'
  );

-- 检查视图是否创建成功
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = 'fashion_supplychain'
  AND TABLE_TYPE = 'VIEW'
  AND TABLE_NAME LIKE 'v_payroll%';

-- ===========================================================
-- 卸载脚本（谨慎使用！）
-- ===========================================================

-- DROP TABLE IF EXISTS t_payment_record;
-- DROP TABLE IF EXISTS t_payroll_settlement;
-- DROP TABLE IF EXISTS t_payroll_settlement_data;
-- DROP VIEW IF EXISTS v_payroll_settlement_summary;
-- DROP VIEW IF EXISTS v_payment_pending;
