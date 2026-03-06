CREATE TABLE IF NOT EXISTS t_tenant_intelligence_profile (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    primary_goal VARCHAR(32) DEFAULT NULL COMMENT '经营目标: DELIVERY/PROFIT/CASHFLOW',
    delivery_warning_days INT DEFAULT NULL COMMENT '交期预警天数',
    anomaly_warning_count INT DEFAULT NULL COMMENT '异常预警阈值',
    low_margin_threshold DECIMAL(10, 2) DEFAULT NULL COMMENT '低毛利预警阈值',
    remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_tip_tenant_id (tenant_id),
    KEY idx_tip_primary_goal (primary_goal)
) COMMENT='租户级智能经营画像配置';