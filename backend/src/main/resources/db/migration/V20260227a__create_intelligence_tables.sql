-- ============================================================
-- 智能编排学习层：工序耗时统计表（数据飞轮核心）
-- 来源：每日从 t_scan_record 聚合计算，持续积累学习数据
-- ============================================================
CREATE TABLE IF NOT EXISTS t_intelligence_process_stats (
    id                       VARCHAR(64)    NOT NULL PRIMARY KEY,
    tenant_id                BIGINT                          COMMENT '租户ID',
    stage_name               VARCHAR(100)   NOT NULL         COMMENT '工序阶段名称（对应 progress_stage）',
    scan_type                VARCHAR(50)    NOT NULL         COMMENT '扫码类型（production/quality/warehouse等）',
    sample_count             INT            NOT NULL DEFAULT 0 COMMENT '样本量：参与统计的订单数',
    avg_minutes_per_unit     DECIMAL(10,3)                   COMMENT '每件平均耗时（分钟），用于乘以剩余件数得出预测时长',
    min_minutes_per_unit     DECIMAL(10,3)                   COMMENT '每件最短耗时（分钟）',
    max_minutes_per_unit     DECIMAL(10,3)                   COMMENT '每件最长耗时（分钟）',
    avg_stage_total_minutes  DECIMAL(12,3)                   COMMENT '该阶段整体平均耗时（分钟），用于按进度比例预测',
    confidence_score         DECIMAL(4,3)   NOT NULL DEFAULT 0.40 COMMENT '置信度 0~1，随样本量增大（公式: min(0.92, 0.35+ln(n+1)*0.12)）',
    last_computed_time       DATETIME                        COMMENT '最后一次计算时间',
    create_time              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_tenant_stage_type (tenant_id, stage_name, scan_type),
    INDEX idx_tenant_stage (tenant_id, stage_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能编排-工序耗时统计（规则型预判学习数据）';

-- ============================================================
-- 智能编排学习层：预测记录与反馈日志（闭环学习数据源）
-- 记录每次预测 + 用户反馈实际完成时间，偏差数据驱动模型迭代
-- ============================================================
CREATE TABLE IF NOT EXISTS t_intelligence_prediction_log (
    id                    VARCHAR(64)   NOT NULL PRIMARY KEY,
    tenant_id             BIGINT                          COMMENT '租户ID',
    prediction_id         VARCHAR(64)   NOT NULL         COMMENT '预测唯一ID（返回给前端缓存，反馈时上传）',
    order_id              VARCHAR(64)                     COMMENT '订单ID',
    order_no              VARCHAR(100)                    COMMENT '订单号',
    stage_name            VARCHAR(100)                    COMMENT '工序阶段',
    process_name          VARCHAR(100)                    COMMENT '子工序名',
    current_progress      INT                             COMMENT '预测时的当前进度（0-100）',
    predicted_finish_time DATETIME                        COMMENT '模型预测的完成时间',
    actual_finish_time    DATETIME                        COMMENT '实际完成时间（用户反馈后回填）',
    confidence            DECIMAL(4,3)                    COMMENT '本次预测使用的置信度',
    deviation_minutes     BIGINT                          COMMENT '偏差分钟数 = TIMESTAMPDIFF(MINUTE, predicted, actual)',
    feedback_accepted     TINYINT(1)                      COMMENT '用户是否采纳了建议（1=接受，0=拒绝）',
    sample_count          INT                             COMMENT '预测时使用的样本量（同步记录，便于分析）',
    algorithm_version     VARCHAR(20)   DEFAULT 'rule_v1' COMMENT '使用的算法版本（rule_v1=规则引擎，ml_v1=机器学习）',
    create_time           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_prediction_id (prediction_id),
    INDEX idx_order_stage (order_id, stage_name),
    INDEX idx_tenant_create (tenant_id, create_time),
    INDEX idx_deviation (tenant_id, deviation_minutes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能编排-预测日志与反馈（闭环学习数据源）';
