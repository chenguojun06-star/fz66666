CREATE TABLE IF NOT EXISTS t_tenant_smart_feature (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    feature_key VARCHAR(100) NOT NULL COMMENT '智能开关键',
    enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用',
    remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_tenant_feature_key (tenant_id, feature_key),
    KEY idx_tsf_tenant_id (tenant_id),
    KEY idx_tsf_feature_key (feature_key)
) COMMENT='租户级智能功能开关';
