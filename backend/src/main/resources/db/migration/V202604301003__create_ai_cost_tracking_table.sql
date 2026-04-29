CREATE TABLE IF NOT EXISTS t_ai_cost_tracking (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    model_name VARCHAR(64) NOT NULL,
    scene VARCHAR(32) NOT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    estimated_cost_usd DECIMAL(10,6) DEFAULT 0,
    latency_ms INT DEFAULT 0,
    success TINYINT(1) DEFAULT 1,
    error_message VARCHAR(512),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_act_tenant_created (tenant_id, created_at),
    INDEX idx_act_tenant_model (tenant_id, model_name),
    INDEX idx_act_tenant_scene (tenant_id, scene)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
