-- 创建多码单价配置表
-- 用于存储每个工序在不同尺码下的单价

CREATE TABLE IF NOT EXISTS t_style_size_price (
    id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
    style_id BIGINT NOT NULL COMMENT '款号ID',
    process_code VARCHAR(50) NOT NULL COMMENT '工序编码',
    process_name VARCHAR(100) NOT NULL COMMENT '工序名称',
    size VARCHAR(20) NOT NULL COMMENT '尺码',
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '该尺码的单价',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_id (style_id),
    INDEX idx_process_code (process_code),
    INDEX idx_size (size),
    UNIQUE KEY uk_style_process_size (style_id, process_code, size)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣多码单价配置表';
