-- Idempotent migration: errors from pre-existing structures are silently ignored
-- Wrapped in stored procedure with CONTINUE HANDLER to skip duplicate column/table/index errors
DROP PROCEDURE IF EXISTS `__mig_V20260308b__add_intelligence_execution_tables`;
DELIMITER $$
CREATE PROCEDURE `__mig_V20260308b__add_intelligence_execution_tables`()
BEGIN
    DECLARE CONTINUE HANDLER FOR SQLEXCEPTION BEGIN END;
    -- =====================================================
    -- 数据库迁移脚本：智能执行引擎表
    -- 版本：V20260308__add_intelligence_execution_tables.sql
    -- 日期：2026-03-08
    -- 说明：为 AI 执行引擎添加审计日志、待审批命令、工作流日志三张表
    -- =====================================================

    -- ===== 表 1: 审计日志表 =====
    -- 用途：记录所有 AI 执行的命令和结果，用于追踪、审计、合规
    CREATE TABLE IF NOT EXISTS `t_intelligence_audit_log` (
      `id` VARCHAR(64) NOT NULL COMMENT '审计日志ID',
      `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
      `command_id` VARCHAR(64) NOT NULL COMMENT '命令ID',
      `action` VARCHAR(100) NOT NULL COMMENT '命令类型 (order:hold, purchase:create, etc)',
      `target_id` VARCHAR(255) NOT NULL COMMENT '目标对象ID (订单号、采购单号，etc)',
      `executor_id` VARCHAR(64) NOT NULL COMMENT '执行人ID',
      `status` VARCHAR(50) NOT NULL COMMENT '执行状态 (EXECUTING/SUCCESS/FAILED/CANCELLED)',
      `reason` TEXT COMMENT '命令的原始理由/建议',
      `risk_level` INT COMMENT '风险等级 (1-5)',
      `requires_approval` TINYINT(1) DEFAULT 0 COMMENT '是否需要人工审批',
      `result_data` LONGTEXT COMMENT '执行结果 (JSON格式)',
      `error_message` TEXT COMMENT '错误信息 (失败时)',
      `duration_ms` BIGINT COMMENT '执行耗时 (毫秒)',
      `remark` TEXT COMMENT '备注',
      `approved_by` VARCHAR(64) COMMENT '审批人ID',
      `approved_at` DATETIME COMMENT '审批时间',
      `approval_remark` TEXT COMMENT '审批备注',
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
      `deleted_flag` TINYINT(1) DEFAULT 0 COMMENT '删除标志',

      PRIMARY KEY (`id`),
      KEY `idx_tenant_status` (`tenant_id`, `status`),
      KEY `idx_command_id` (`command_id`),
      KEY `idx_target_id` (`target_id`),
      KEY `idx_executor_created` (`executor_id`, `created_at`),
      KEY `idx_action_created` (`action`, `created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 执行引擎审计日志表';

    -- ===== 表 2: 待审批命令表 =====
    -- 用途：存储待人工审批的高风险命令，前端通过此表显示审批列表
    CREATE TABLE IF NOT EXISTS `t_intelligence_pending_approvals` (
      `id` VARCHAR(64) NOT NULL COMMENT '待审批记录ID',
      `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
      `command_id` VARCHAR(64) NOT NULL COMMENT '命令ID',
      `action` VARCHAR(100) NOT NULL COMMENT '命令类型',
      `target_id` VARCHAR(255) NOT NULL COMMENT '目标对象ID',
      `requester_id` VARCHAR(64) NOT NULL COMMENT '发起者ID (通常是 AI)',
      `request_reason` TEXT COMMENT '发起原因',
      `risk_level` INT COMMENT '风险等级',
      `command_params` LONGTEXT COMMENT '命令参数 (JSON)',
      `required_roles` VARCHAR(500) COMMENT '需要的审批角色 (逗号分隔)',
      `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING' COMMENT '审批状态 (PENDING/APPROVED/REJECTED)',
      `approval_deadline` DATETIME COMMENT '审批截止时间',
      `approved_by` VARCHAR(64) COMMENT '审批者ID',
      `approval_time` DATETIME COMMENT '审批时间',
      `approval_result` VARCHAR(50) COMMENT '审批结果 (APPROVED/REJECTED)',
      `approval_reason` TEXT COMMENT '审批理由',
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',
      `deleted_flag` TINYINT(1) DEFAULT 0 COMMENT '删除标志',

      PRIMARY KEY (`id`),
      KEY `idx_tenant_status` (`tenant_id`, `status`),
      KEY `idx_command_id` (`command_id`),
      KEY `idx_deadline` (`approval_deadline`),
      KEY `idx_requester` (`requester_id`),
      UNIQUE KEY `uk_command_id` (`command_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='待审批命令表';

    -- ===== 表 3: 工作流日志表 =====
    -- 用途：记录命令执行后的级联工作流（Cascade Workflows）
    CREATE TABLE IF NOT EXISTS `t_intelligence_workflow_log` (
      `id` VARCHAR(64) NOT NULL COMMENT '工作流日志ID',
      `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
      `command_id` VARCHAR(64) NOT NULL COMMENT '触发命令ID',
      `workflow_type` VARCHAR(100) NOT NULL COMMENT '工作流类型',
      `triggered_tasks` LONGTEXT COMMENT '触发的任务列表 (JSON)',
      `notified_teams` VARCHAR(500) COMMENT '被通知的团队 (逗号分隔)',
      `cascaded_count` INT DEFAULT 0 COMMENT '级联任务数',
      `status` VARCHAR(50) NOT NULL COMMENT '工作流状态 (COMPLETED/PARTIAL_FAILED/FAILED)',
      `error_message` TEXT COMMENT '错误信息',
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      `completed_at` DATETIME COMMENT '完成时间',
      `remark` TEXT COMMENT '备注',
      `deleted_flag` TINYINT(1) DEFAULT 0 COMMENT '删除标志',

      PRIMARY KEY (`id`),
      KEY `idx_tenant_command` (`tenant_id`, `command_id`),
      KEY `idx_workflow_type` (`workflow_type`),
      KEY `idx_created` (`created_at`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='工作流日志表';

    -- ===== 表 4: 智能执行配置表 =====
    -- 用途：存储每个租户的智能执行配置（自动执行开关、风险阈值等）
    CREATE TABLE IF NOT EXISTS `t_intelligence_execution_config` (
      `id` VARCHAR(64) NOT NULL COMMENT '配置ID',
      `tenant_id` BIGINT NOT NULL UNIQUE COMMENT '租户ID',
      `auto_execution_enabled` TINYINT(1) DEFAULT 1 COMMENT '是否启用自动执行',
      `auto_execution_threshold` INT DEFAULT 2 COMMENT '自动执行风险阈值 (1-5)',
      `approval_timeout_minutes` INT DEFAULT 1440 COMMENT '审批超时时间 (分钟，默认24小时)',
      `notification_enabled` TINYINT(1) DEFAULT 1 COMMENT '是否启用通知',
      `audit_enabled` TINYINT(1) DEFAULT 1 COMMENT '是否启用审计',
      `max_cascade_depth` INT DEFAULT 3 COMMENT '最大级联深度',
      `command_expiry_hours` INT DEFAULT 48 COMMENT '命令过期时间 (小时)',
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '修改时间',

      PRIMARY KEY (`id`),
      KEY `idx_tenant_id` (`tenant_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能执行配置表';

    -- ===== 表 5: AI 执行效果评分表 =====
    -- 用途：记录用户对 AI 建议的反馈和满意度评分（用于优化 AI 模型）
    CREATE TABLE IF NOT EXISTS `t_intelligence_feedback` (
      `id` VARCHAR(64) NOT NULL COMMENT '反馈ID',
      `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
      `command_id` VARCHAR(64) NOT NULL COMMENT '命令ID',
      `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
      `satisfaction_score` INT COMMENT '满意度评分 (1-5)',
      `feedback_text` TEXT COMMENT '反馈文本',
      `impact_description` TEXT COMMENT '实际影响描述',
      `feedback_type` VARCHAR(50) COMMENT '反馈类型 (positive/negative/neutral)',
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
      `deleted_flag` TINYINT(1) DEFAULT 0 COMMENT '删除标志',

      PRIMARY KEY (`id`),
      KEY `idx_tenant_command` (`tenant_id`, `command_id`),
      KEY `idx_user_created` (`user_id`, `created_at`),
      KEY `idx_satisfaction` (`satisfaction_score`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 执行效果反馈表';

    -- ===== 创建索引优化查询 =====

    -- 审计日志表索引（提高查询性能）
    ALTER TABLE `t_intelligence_audit_log`
    ADD INDEX `idx_tenant_created_status` (`tenant_id`, `created_at` DESC, `status`);

    -- 待审批表索引（快速查找待审批项）
    ALTER TABLE `t_intelligence_pending_approvals`
    ADD INDEX `idx_pending_deadline` (`status`, `approval_deadline`);

    -- 工作流表索引
    ALTER TABLE `t_intelligence_workflow_log`
    ADD INDEX `idx_cascaded_count` (`cascaded_count`);

    -- ===== 初始化租户配置 =====
    -- 为默认租户插入默认配置
    INSERT IGNORE INTO `t_intelligence_execution_config`
      (id, tenant_id, auto_execution_enabled, auto_execution_threshold, notification_enabled, audit_enabled)
    VALUES
      ('default-config', 0, 1, 2, 1, 1);

    -- ===== 备注 =====
    -- 1. 所有表都包含 tenant_id，确保多租户数据隔离
    -- 2. 所有业务表都包含 deleted_flag，支持逻辑删除
    -- 3. 审计日志表有完整的执行过程记录：
    --    - 命令生成 → 权限检查 → 执行 → 结果
    --    - 用于问题追溯、性能分析、模型优化
    -- 4. 待审批表有截止时间，防止审批超期
    -- 5. 工作流表记录级联工作流的完整链路
    -- 6. 反馈表用于收集用户意见，改进 AI 模型
    -- 7. 配置表支持每个租户的定制化配置

END$$
DELIMITER ;
CALL `__mig_V20260308b__add_intelligence_execution_tables`();
DROP PROCEDURE IF EXISTS `__mig_V20260308b__add_intelligence_execution_tables`;
