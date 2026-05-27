SET @dbname = DATABASE();

SET @c1 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_tenant_ai_config');
SET @s1 = IF(@c1=0,
  'CREATE TABLE t_tenant_ai_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    text_provider VARCHAR(32) DEFAULT ''mimo'' COMMENT ''文本模型服务商: mimo/azure/deepseek/custom'',
    text_api_key VARCHAR(512) COMMENT ''AES-256-GCM加密存储'',
    text_base_url VARCHAR(512) COMMENT ''自定义API地址'',
    text_model VARCHAR(64) COMMENT ''自定义模型名称'',
    vision_provider VARCHAR(32) DEFAULT ''mimo'' COMMENT ''视觉模型服务商'',
    vision_api_key VARCHAR(512) COMMENT ''AES-256-GCM加密存储'',
    vision_base_url VARCHAR(512) COMMENT ''自定义API地址'',
    vision_model VARCHAR(64) COMMENT ''自定义模型名称'',
    monthly_budget DECIMAL(10,2) DEFAULT 0 COMMENT ''月度预算上限(元)，0=不限'',
    rate_limit_rpm INT DEFAULT 60 COMMENT ''每分钟请求限制'',
    ai_enabled TINYINT(1) DEFAULT 1 COMMENT ''是否启用AI'',
    config_source VARCHAR(16) DEFAULT ''platform'' COMMENT ''platform=平台代充/tenant=租户自带/trial=试用'',
    delete_flag INT DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tac_tenant_id (tenant_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''租户AI能力配置''
', 'SELECT 1');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @c2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_tenant_ai_usage');
SET @s2 = IF(@c2=0,
  'CREATE TABLE t_tenant_ai_usage (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    usage_date DATE NOT NULL COMMENT ''统计日期'',
    provider VARCHAR(32) COMMENT ''服务商'',
    model VARCHAR(64) COMMENT ''模型名称'',
    request_count INT DEFAULT 0 COMMENT ''请求次数'',
    token_count BIGINT DEFAULT 0 COMMENT ''Token消耗量'',
    cost_amount DECIMAL(10,4) DEFAULT 0 COMMENT ''预估费用'',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tau_tenant_date (tenant_id, usage_date),
    INDEX idx_tau_tenant_provider (tenant_id, provider)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT=''租户AI用量统计''
', 'SELECT 1');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;