-- 创建二次工艺表
-- 创建时间：2026-01-28

USE fashion_supplychain;

-- 创建二次工艺表
CREATE TABLE IF NOT EXISTS t_secondary_process (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    style_id BIGINT NOT NULL COMMENT '款号ID',
    process_type VARCHAR(50) NOT NULL COMMENT '工艺类型（embroidery/printing/washing/dyeing/ironing/pleating/beading/other）',
    process_name VARCHAR(100) COMMENT '工艺名称',
    quantity INT DEFAULT 0 COMMENT '数量',
    unit_price DECIMAL(10, 2) DEFAULT 0.00 COMMENT '单价',
    total_price DECIMAL(10, 2) DEFAULT 0.00 COMMENT '总价',
    factory_name VARCHAR(100) COMMENT '工厂名称',
    status VARCHAR(20) DEFAULT 'pending' COMMENT '状态（pending/processing/completed/cancelled）',
    remark TEXT COMMENT '备注',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_id (style_id),
    INDEX idx_process_type (process_type),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='二次工艺表';

-- 验证表是否创建成功
SHOW CREATE TABLE t_secondary_process;
