-- ============================================================
-- V20260329: 创建智能执行审计日志表 + 工作流日志表
-- 修复: t_intelligence_audit_log doesn't exist
-- 修复: t_intelligence_workflow_log doesn't exist（预防）
-- 注意: 均使用 CREATE TABLE IF NOT EXISTS，幂等安全
-- ============================================================

-- ── 1. 智能执行审计日志表 ──
CREATE TABLE IF NOT EXISTS `t_intelligence_audit_log` (
    `id`                VARCHAR(32)     NOT NULL                    COMMENT '审计日志ID',
    `tenant_id`         BIGINT          NOT NULL                    COMMENT '租户ID',
    `command_id`        VARCHAR(64)     DEFAULT NULL                COMMENT '命令ID（关联命令）',
    `action`            VARCHAR(100)    DEFAULT NULL                COMMENT '命令类型，如 order:hold',
    `target_id`         VARCHAR(100)    DEFAULT NULL                COMMENT '目标对象ID，如订单号',
    `executor_id`       VARCHAR(64)     DEFAULT NULL                COMMENT '执行人ID',
    `status`            VARCHAR(32)     DEFAULT 'EXECUTING'         COMMENT '执行状态 EXECUTING/SUCCESS/FAILED/CANCELLED',
    `reason`            VARCHAR(500)    DEFAULT NULL                COMMENT '命令原始理由',
    `risk_level`        INT             DEFAULT NULL                COMMENT '风险等级 1-5',
    `result_data`       TEXT            DEFAULT NULL                COMMENT '执行结果JSON',
    `error_message`     TEXT            DEFAULT NULL                COMMENT '错误信息（失败时）',
    `duration_ms`       BIGINT          DEFAULT NULL                COMMENT '执行耗时（毫秒）',
    `remark`            VARCHAR(500)    DEFAULT NULL                COMMENT '备注',
    `created_at`        DATETIME        DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `requires_approval` TINYINT(1)      DEFAULT 0                  COMMENT '是否需要人工审批',
    `approved_by`       VARCHAR(64)     DEFAULT NULL                COMMENT '审批人ID',
    `approved_at`       DATETIME        DEFAULT NULL                COMMENT '审批时间',
    `approval_remark`   VARCHAR(500)    DEFAULT NULL                COMMENT '审批备注',
    PRIMARY KEY (`id`),
    KEY `idx_audit_tenant_status` (`tenant_id`, `status`),
    KEY `idx_audit_command_id`    (`command_id`),
    KEY `idx_audit_created_at`    (`tenant_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能执行审计日志';


-- ── 2. 智能工作流日志表（预防同类报错） ──
CREATE TABLE IF NOT EXISTS `t_intelligence_workflow_log` (
    `id`              VARCHAR(32)     NOT NULL                    COMMENT '工作流日志ID',
    `tenant_id`       BIGINT          NOT NULL                    COMMENT '租户ID',
    `command_id`      VARCHAR(64)     DEFAULT NULL                COMMENT '触发命令ID',
    `workflow_type`   VARCHAR(100)    DEFAULT NULL                COMMENT '工作流类型',
    `triggered_tasks` TEXT            DEFAULT NULL                COMMENT '触发任务列表JSON',
    `notified_teams`  VARCHAR(500)    DEFAULT NULL                COMMENT '通知团队',
    `cascaded_count`  INT             DEFAULT 0                   COMMENT '级联操作数量',
    `status`          VARCHAR(32)     DEFAULT 'RUNNING'           COMMENT '工作流状态 RUNNING/COMPLETED/FAILED',
    `error_message`   TEXT            DEFAULT NULL                COMMENT '错误信息',
    `duration_ms`     BIGINT          DEFAULT NULL                COMMENT '执行耗时（毫秒）',
    `remark`          VARCHAR(500)    DEFAULT NULL                COMMENT '备注',
    `created_at`      DATETIME        DEFAULT CURRENT_TIMESTAMP  COMMENT '创建时间',
    `completed_at`    DATETIME        DEFAULT NULL                COMMENT '完成时间',
    `deleted_flag`    INT             DEFAULT 0                   COMMENT '软删除 0=正常 1=删除',
    PRIMARY KEY (`id`),
    KEY `idx_workflow_tenant`     (`tenant_id`),
    KEY `idx_workflow_command_id` (`command_id`),
    KEY `idx_workflow_created_at` (`tenant_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能工作流执行日志';
