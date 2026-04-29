CREATE TABLE IF NOT EXISTS t_scan_precheck_feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    order_no VARCHAR(64),
    scan_type VARCHAR(32),
    precheck_issues JSON,
    user_action VARCHAR(16) NOT NULL,
    user_remark VARCHAR(512),
    operator_id BIGINT,
    operator_name VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_spf_tenant_order (tenant_id, order_no),
    INDEX idx_spf_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS t_order_risk_tracking (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    order_no VARCHAR(64) NOT NULL,
    risk_level VARCHAR(16) NOT NULL,
    risk_factors JSON,
    assigned_to VARCHAR(64),
    handling_status VARCHAR(32) DEFAULT 'pending',
    handling_action TEXT,
    handling_result TEXT,
    handled_by VARCHAR(64),
    handled_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ort_tenant_order (tenant_id, order_no),
    INDEX idx_ort_tenant_status (tenant_id, handling_status),
    INDEX idx_ort_tenant_created (tenant_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
