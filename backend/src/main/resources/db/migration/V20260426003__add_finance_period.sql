CREATE TABLE IF NOT EXISTS t_finance_period (
    id VARCHAR(36) PRIMARY KEY,
    year INT NOT NULL COMMENT '年份',
    month INT NOT NULL COMMENT '月份',
    start_date DATE COMMENT '开始日期',
    end_date DATE COMMENT '结束日期',
    status VARCHAR(16) DEFAULT 'OPEN' COMMENT '状态: OPEN/LOCKED',
    locked_by VARCHAR(36) COMMENT '锁定人ID',
    locked_time DATETIME COMMENT '锁定时间',
    remark VARCHAR(256) COMMENT '备注',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    create_by VARCHAR(36) COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_year_month_tenant (year, month, tenant_id),
    KEY idx_tenant_id (tenant_id),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='财务期间管理';
