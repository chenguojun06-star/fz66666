-- ============================================================
-- P0-1: 协作任务闭环增强 — 新增全生命周期管理字段
-- ============================================================

ALTER TABLE t_collaboration_task
    ADD COLUMN IF NOT EXISTS task_status VARCHAR(32) DEFAULT 'PENDING' COMMENT '任务状态: PENDING/ACCEPTED/IN_PROGRESS/COMPLETED/ESCALATED/CANCELLED',
    ADD COLUMN IF NOT EXISTS priority VARCHAR(16) DEFAULT 'MEDIUM' COMMENT '优先级: CRITICAL/HIGH/MEDIUM/LOW',
    ADD COLUMN IF NOT EXISTS assignee_name VARCHAR(128) COMMENT '实际执行人姓名',
    ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT COMMENT '验收条件/完成标准',
    ADD COLUMN IF NOT EXISTS escalated_at DATETIME COMMENT '升级时间',
    ADD COLUMN IF NOT EXISTS escalated_to VARCHAR(128) COMMENT '升级目标(岗位/人员)',
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) COMMENT '来源类型: AI_DISPATCH/MANUAL/CREW_MEETING/PATROL',
    ADD COLUMN IF NOT EXISTS source_instruction TEXT COMMENT '原始AI指令原文',
    ADD COLUMN IF NOT EXISTS completion_note TEXT COMMENT '完成备注/交付说明',
    ADD COLUMN IF NOT EXISTS completed_at DATETIME COMMENT '实际完成时间';

-- 扩展索引，支持任务中心多维查询
ALTER TABLE t_collaboration_task
    ADD INDEX IF NOT EXISTS idx_collab_status (task_status),
    ADD INDEX IF NOT EXISTS idx_collab_priority_due (priority, due_at),
    ADD INDEX IF NOT EXISTS idx_collab_assignee (assignee_name),
    ADD INDEX IF NOT EXISTS idx_collab_tenant_status (tenant_id, task_status);

-- ============================================================
-- P1-4: AI 指标看板 — 创建智能指标快照表
-- ============================================================

CREATE TABLE IF NOT EXISTS t_ai_metrics_snapshot (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT COMMENT '租户ID(NULL=平台级)',
    snapshot_date DATE NOT NULL COMMENT '快照日期',
    intent_hit_rate DECIMAL(5,2) COMMENT '意图命中率(%)',
    tool_call_success_rate DECIMAL(5,2) COMMENT '工具调用成功率(%)',
    first_response_accept_rate DECIMAL(5,2) COMMENT '首轮采纳率(%)',
    manual_override_rate DECIMAL(5,2) COMMENT '人工改写率(%)',
    approval_turnaround_avg_minutes INT COMMENT '平均审批耗时(分钟)',
    total_ai_requests INT COMMENT 'AI请求总数',
    total_tool_calls INT COMMENT '工具调用总数',
    total_escalations INT COMMENT '升级任务数',
    active_collab_tasks INT COMMENT '活跃协作任务数',
    overdue_collab_tasks INT COMMENT '逾期协作任务数',
    avg_agent_iterations DECIMAL(4,1) COMMENT '平均Agent循环轮数',
    cost_estimated_cents INT COMMENT '预估API费用(分)',
    metrics_json JSON COMMENT '扩展指标JSON',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_metrics_date (snapshot_date),
    INDEX idx_metrics_tenant_date (tenant_id, snapshot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI智能指标快照';

-- ============================================================
-- P1-5: Agent 执行日志增强 — 新增一致性验证字段
-- ============================================================

ALTER TABLE t_intelligence_audit_log
    ADD COLUMN IF NOT EXISTS self_consistency_agreement DECIMAL(5,2) COMMENT '自一致性验证一致率(%)',
    ADD COLUMN IF NOT EXISTS guard_warnings TEXT COMMENT '真实性守卫告警内容汇总';
