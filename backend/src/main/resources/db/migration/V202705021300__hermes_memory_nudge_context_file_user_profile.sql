-- Hermes Agent Phase 2: Memory Nudge + Context File Loader + User Profile Evolution
-- 2026-05-02

CREATE TABLE IF NOT EXISTS t_memory_nudge (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    nudge_type VARCHAR(32) NOT NULL COMMENT 'FACT/INSIGHT/PREFERENCE/PATTERN',
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    context_summary VARCHAR(500) COMMENT '触发该记忆提醒的上下文摘要',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/ACCEPTED/DISMISSED/EXPIRED',
    accepted_at DATETIME COMMENT '用户确认时间',
    dismissed_at DATETIME COMMENT '用户忽略时间',
    expires_at DATETIME COMMENT '提醒过期时间',
    conversation_id VARCHAR(64) COMMENT '来源对话ID',
    confidence DECIMAL(3,2) DEFAULT 0.50,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant_user_status (tenant_id, user_id, status),
    INDEX idx_tenant_user_type (tenant_id, user_id, nudge_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Hermes Memory Nudge: AI主动记忆提醒，询问用户是否保存知识';

CREATE TABLE IF NOT EXISTS t_user_profile_evolution (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    profile_layer VARCHAR(32) NOT NULL COMMENT 'BASIC/ROLE/BEHAVIOR/PREFERENCE/EXPERTISE',
    field_key VARCHAR(64) NOT NULL,
    field_value TEXT NOT NULL,
    confidence DECIMAL(3,2) DEFAULT 0.50,
    evidence_count INT DEFAULT 1 COMMENT '支持该画像的证据数量',
    source_conversation_ids TEXT COMMENT '来源对话ID列表',
    last_observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_user_layer_key (tenant_id, user_id, profile_layer, field_key),
    INDEX idx_tenant_user (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Hermes User Profile Evolution: 跨会话用户画像演化模型';

CREATE TABLE IF NOT EXISTS t_conversation_summary (
    id VARCHAR(32) NOT NULL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    session_id VARCHAR(64) NOT NULL,
    summary_type VARCHAR(32) NOT NULL COMMENT 'DAILY/WEEKLY/SESSION/MILESTONE',
    start_conversation_id VARCHAR(64) COMMENT '起始对话ID',
    end_conversation_id VARCHAR(64) COMMENT '结束对话ID',
    summary_title VARCHAR(255) NOT NULL,
    summary_content TEXT NOT NULL,
    key_insights TEXT COMMENT '关键洞察列表',
    action_items TEXT COMMENT '待办事项',
    conversation_count INT DEFAULT 1,
    tool_usage_stats TEXT COMMENT '工具使用统计JSON',
    period_start DATETIME COMMENT '统计周期开始',
    period_end DATETIME COMMENT '统计周期结束',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tenant_user_session (tenant_id, user_id, session_id),
    INDEX idx_tenant_user_type (tenant_id, user_id, summary_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Hermes Conversation Summary: 对话周期总结';

INSERT IGNORE INTO t_agent_context_file (id, tenant_id, file_name, file_path, content, is_active, priority, scope, created_by, created_at, updated_at)
SELECT 'ctx_default_system', 0, 'SYSTEM_DEFAULT.md', '/agents/SYSTEM_DEFAULT.md',
'# 小云系统默认上下文

你叫小云，是一个服装供应链智能AI助手。你的核心使命是：
1. 帮助用户高效管理生产订单、追踪工序进度、发现异常
2. 提供数据驱动的经营建议和风险预警
3. 记住用户偏好和习惯，提供个性化服务
4. 主动学习用户的业务流程，持续优化建议质量

## 核心原则
- 数据隔离：每个租户的数据完全隔离，不能跨租户泄露
- 权限遵守：严格遵循用户的角色权限，工人只能看自己的数据
- 主动服务：发现异常主动提醒，不等待用户询问
- 可追溯：所有建议和操作都要能追溯到具体数据来源
',
1, 100, 'SYSTEM', 'SYSTEM', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM t_agent_context_file WHERE id = 'ctx_default_system');
