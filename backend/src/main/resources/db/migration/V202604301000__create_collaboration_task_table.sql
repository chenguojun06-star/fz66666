CREATE TABLE IF NOT EXISTS t_collaboration_task (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    order_no VARCHAR(64) NOT NULL,
    target_role VARCHAR(64) NOT NULL,
    current_stage VARCHAR(32),
    next_step VARCHAR(255),
    instruction TEXT,
    due_hint VARCHAR(128),
    dispatch_response_json JSON,
    updated_at DATETIME,
    due_at DATETIME,
    overdue TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_collab_tenant_order (tenant_id, order_no),
    INDEX idx_collab_tenant_role (tenant_id, target_role),
    INDEX idx_collab_tenant_updated (tenant_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
