CREATE TABLE IF NOT EXISTS t_bargain_price (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    target_type VARCHAR(20) NOT NULL COMMENT 'order=大货订单, style=样衣, process=工序',
    target_id VARCHAR(64) NOT NULL COMMENT '目标ID（订单ID/款号/工序CODE）',
    target_no VARCHAR(64) DEFAULT NULL COMMENT '订单号/款号',
    original_price DECIMAL(10,4) NOT NULL COMMENT '原始单价',
    bargained_price DECIMAL(10,4) NOT NULL COMMENT '还价后单价',
    reason VARCHAR(500) DEFAULT NULL COMMENT '还价原因',
    bargained_by VARCHAR(64) NOT NULL COMMENT '还价人ID',
    bargained_by_name VARCHAR(64) NOT NULL COMMENT '还价人姓名',
    approved_by VARCHAR(64) DEFAULT NULL COMMENT '审批人ID',
    approved_by_name VARCHAR(64) DEFAULT NULL COMMENT '审批人姓名',
    status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending=待审批, approved=已通过, rejected=已驳回',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    INDEX idx_tenant_target (tenant_id, target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='还价记录表';