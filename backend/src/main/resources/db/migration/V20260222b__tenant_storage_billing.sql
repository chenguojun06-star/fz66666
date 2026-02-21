-- ==================================================================
-- 租户存储与收费管理
-- ==================================================================

-- 1. 给 t_tenant 增加套餐与存储字段
ALTER TABLE t_tenant
    ADD COLUMN plan_type VARCHAR(20) NOT NULL DEFAULT 'TRIAL' COMMENT '套餐类型: TRIAL/BASIC/PRO/ENTERPRISE' AFTER paid_status,
    ADD COLUMN monthly_fee DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '月费(元)' AFTER plan_type,
    ADD COLUMN storage_quota_mb BIGINT NOT NULL DEFAULT 1024 COMMENT '存储配额(MB)，默认1GB' AFTER monthly_fee,
    ADD COLUMN storage_used_mb BIGINT NOT NULL DEFAULT 0 COMMENT '已用存储(MB)' AFTER storage_quota_mb;

-- 2. 创建计费记录表
CREATE TABLE IF NOT EXISTS t_tenant_billing_record (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    billing_no      VARCHAR(50)     NOT NULL COMMENT '账单编号 BILL20260222001',
    tenant_id       BIGINT          NOT NULL COMMENT '租户ID',
    tenant_name     VARCHAR(100)    NULL COMMENT '租户名称(冗余)',
    billing_month   VARCHAR(7)      NOT NULL COMMENT '账单月份 2026-02',
    plan_type       VARCHAR(20)     NOT NULL COMMENT '套餐类型',
    base_fee        DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '套餐基础费',
    storage_fee     DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '超额存储费',
    user_fee        DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '超额用户费',
    total_amount    DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '合计金额',
    status          VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/PAID/OVERDUE/WAIVED',
    paid_time       DATETIME        NULL COMMENT '支付时间',
    remark          VARCHAR(500)    NULL COMMENT '备注',
    created_by      VARCHAR(50)     NULL COMMENT '创建人',
    create_time     DATETIME        DEFAULT CURRENT_TIMESTAMP,
    update_time     DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag     TINYINT         DEFAULT 0,
    UNIQUE KEY uk_tenant_month (tenant_id, billing_month),
    INDEX idx_billing_no (billing_no),
    INDEX idx_status (status),
    INDEX idx_billing_month (billing_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户计费记录';

-- 3. 套餐定义参考表（后端硬编码即可，这里仅做参考说明）
-- TRIAL:      免费试用,   0元/月,   1GB存储,  5用户
-- BASIC:      基础版,   199元/月,   5GB存储,  20用户
-- PRO:        专业版,   499元/月,  20GB存储,  50用户
-- ENTERPRISE: 企业版,   999元/月, 100GB存储, 200用户
