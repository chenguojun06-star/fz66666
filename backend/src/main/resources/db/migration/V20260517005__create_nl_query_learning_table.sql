CREATE TABLE IF NOT EXISTS t_nl_query_learning (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_query VARCHAR(500) NOT NULL,
    detected_intent VARCHAR(100),
    confidence DOUBLE,
    was_correct BOOLEAN,
    corrected_intent VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_created (tenant_id, created_at),
    INDEX idx_intent (detected_intent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
