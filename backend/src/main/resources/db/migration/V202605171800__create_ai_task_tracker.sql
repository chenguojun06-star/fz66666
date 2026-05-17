CREATE TABLE IF NOT EXISTS t_ai_task_tracker (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    task_source_tool VARCHAR(100) NOT NULL COMMENT '触发工具名',
    task_type VARCHAR(50) NOT NULL COMMENT 'ACTION/NOTIFY/ESCALATE',
    target_type VARCHAR(50) COMMENT 'ORDER/FACTORY/MATERIAL/SAMPLE',
    target_id VARCHAR(200) COMMENT '目标ID'
    task_summary VARCHAR(500) COMMENT '任务摘要',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/IN_PROGRESS/COMPLETED/EXPIRED',
    assigned_to VARCHAR(200) COMMENT '负责人/工厂',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    result_summary VARCHAR(500) COMMENT '完成结果',
    INDEX idx_tenant_status (tenant_id, status),
    INDEX idx_tenant_created (tenant_id, created_at),
    INDEX idx_source_tool (task_source_tool)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;