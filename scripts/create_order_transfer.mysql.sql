-- 创建订单转移表（MySQL 版本）
CREATE TABLE IF NOT EXISTS order_transfer (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL COMMENT '订单ID',
    from_user_id BIGINT NOT NULL COMMENT '原负责人ID',
    to_user_id BIGINT NOT NULL COMMENT '新负责人ID',
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态: pending/accepted/rejected',
    message VARCHAR(500) COMMENT '转移说明',
    reject_reason VARCHAR(500) COMMENT '拒绝原因',
    created_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    handled_time DATETIME COMMENT '处理时间',
    INDEX idx_order_id (order_id),
    INDEX idx_from_user_id (from_user_id),
    INDEX idx_to_user_id (to_user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单转移记录表';
