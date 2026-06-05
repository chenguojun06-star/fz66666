CREATE TABLE IF NOT EXISTS t_print_template (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    template_name VARCHAR(100) NOT NULL COMMENT '模板名称',
    template_type VARCHAR(30) NOT NULL COMMENT '模板类型：hangtag/barcode/washLabel/uCode/location',
    config_json TEXT NOT NULL COMMENT '配置JSON',
    is_default TINYINT(1) DEFAULT 0 COMMENT '是否默认模板',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant_type (tenant_id, template_type)
) COMMENT '打印模板配置表';
