-- ============================================================
-- V20260307001 智慧中枢三张核心表
-- 1. t_intelligence_signal  — 统一信号层（感知即分析）
-- 2. t_intelligence_memory  — 向量记忆层（案例/知识召回）
-- 3. t_intelligence_feedback — 反馈分析表（学习闭环/AI反思）
-- ============================================================

-- ── 1. 统一信号表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_intelligence_signal (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id        BIGINT          NOT NULL,
    signal_type      VARCHAR(50)     NOT NULL COMMENT 'anomaly/bottleneck/risk/shortage',
    signal_code      VARCHAR(100)    NOT NULL COMMENT '信号编码，如 output_spike',
    signal_level     VARCHAR(20)     NOT NULL DEFAULT 'info' COMMENT 'critical/warning/info',
    source_domain    VARCHAR(50)     COMMENT '来源域 production/finance/warehouse',
    source_id        VARCHAR(100)    COMMENT '关联业务ID',
    source_name      VARCHAR(200)    COMMENT '关联业务名称',
    signal_title     VARCHAR(500)    COMMENT '信号标题',
    signal_detail    TEXT            COMMENT '原始信号数据',
    signal_analysis  TEXT            COMMENT 'AI生成的类人化分析：为什么/影响什么/建议先做什么',
    related_ids      VARCHAR(500)    COMMENT '关联信号IDs（关联推理）',
    priority_score   INT             NOT NULL DEFAULT 50 COMMENT '优先级评分 0-100',
    status           VARCHAR(20)     NOT NULL DEFAULT 'open' COMMENT 'open/handling/resolved',
    resolved_at      DATETIME        COMMENT '解决时间',
    create_time      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag      INT             NOT NULL DEFAULT 0,
    INDEX idx_tenant_status  (tenant_id, status, create_time),
    INDEX idx_tenant_level   (tenant_id, signal_level, priority_score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='统一智能信号表';

-- ── 2. 智能记忆表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_intelligence_memory (
    id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id        BIGINT          NOT NULL,
    memory_type      VARCHAR(50)     NOT NULL COMMENT 'case/knowledge/preference',
    memory_code      VARCHAR(100)    COMMENT '记忆编码',
    business_domain  VARCHAR(50)     COMMENT '业务域',
    title            VARCHAR(500)    COMMENT '记忆标题',
    content          TEXT            NOT NULL COMMENT '记忆正文内容',
    embedding_id     VARCHAR(100)    COMMENT 'Qdrant中的向量ID',
    tenant_preference TEXT           COMMENT '关联租户偏好JSON',
    recall_count     INT             NOT NULL DEFAULT 0 COMMENT '被召回次数',
    adopted_count    INT             NOT NULL DEFAULT 0 COMMENT '被采纳次数',
    relevance_score  DECIMAL(5,4)    COMMENT '最近一次Qdrant相似度分数',
    create_time      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag      INT             NOT NULL DEFAULT 0,
    INDEX idx_tenant_type    (tenant_id, memory_type, business_domain),
    INDEX idx_embedding_id   (embedding_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能记忆表（向量记忆层）';

-- ── 3. 反馈分析表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS t_intelligence_feedback (
    id                   BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    tenant_id            BIGINT          NOT NULL,
    prediction_id        VARCHAR(100)    COMMENT '关联预测记录ID',
    feedback_type        VARCHAR(50)     COMMENT 'suggestion_adopted/rejected/false_positive',
    suggestion_type      VARCHAR(100)    COMMENT '建议类型 assignment/quote/delivery',
    suggestion_content   TEXT            COMMENT '建议内容摘要',
    feedback_result      VARCHAR(20)     COMMENT 'accepted/rejected/modified',
    feedback_reason      VARCHAR(500)    COMMENT '用户反馈原因',
    feedback_analysis    TEXT            COMMENT 'AI自动分析反馈原因（类人反思）',
    deviation_minutes    BIGINT          COMMENT '预测偏差分钟',
    optimization_action  VARCHAR(500)    COMMENT 'AI生成的优化措施',
    create_time          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_tenant_type    (tenant_id, feedback_type, create_time),
    INDEX idx_prediction_id  (prediction_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能反馈分析表（学习闭环）';
