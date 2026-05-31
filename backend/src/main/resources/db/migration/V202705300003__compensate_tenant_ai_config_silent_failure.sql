-- ============================================================
-- V202705300003: t_tenant_ai_config + t_tenant_ai_usage 静默失败补偿
-- ============================================================
-- 根因：V20260527001 使用 SET @s 动态 SQL 内含 COMMENT ''字符串''，
--       Flyway 解析器可能静默跳过 CREATE TABLE，导致两表在云端从未创建。
-- 修复：直接使用 CREATE TABLE IF NOT EXISTS（不在 SET @s 内），
--       Flyway 可正确解析，且幂等安全。
-- 安全：IF NOT EXISTS 确保已存在的表不受影响。
-- ============================================================

CREATE TABLE IF NOT EXISTS t_tenant_ai_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    text_provider VARCHAR(32) DEFAULT 'mimo',
    text_api_key VARCHAR(512),
    text_base_url VARCHAR(512),
    text_model VARCHAR(64),
    vision_provider VARCHAR(32) DEFAULT 'mimo',
    vision_api_key VARCHAR(512),
    vision_base_url VARCHAR(512),
    vision_model VARCHAR(64),
    monthly_budget DECIMAL(10,2) DEFAULT 0,
    rate_limit_rpm INT DEFAULT 60,
    ai_enabled TINYINT(1) DEFAULT 1,
    config_source VARCHAR(16) DEFAULT 'platform',
    delete_flag INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tac_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS t_tenant_ai_usage (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    usage_date DATE NOT NULL,
    provider VARCHAR(32),
    model VARCHAR(64),
    request_count INT DEFAULT 0,
    token_count BIGINT DEFAULT 0,
    cost_amount DECIMAL(10,4) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tau_tenant_date (tenant_id, usage_date),
    INDEX idx_tau_tenant_provider (tenant_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;