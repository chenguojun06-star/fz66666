-- =========================================================================
-- AI 小云全面升级 — 平台级智能数据沉淀表（6 张新表）
-- 版本：V202604220001 | 日期：2026-04-22
-- 设计原则：
--   1. 所有表都带 tenant_id（多租户隔离基础）
--   2. visibility 字段：TENANT(普通租户可见) / PLATFORM(仅超管/云裳智链可见)
--   3. 平台超管 (ROLE_SUPER_ADMIN) 可看到所有租户的全量数据用于训练/优化
--   4. 普通租户只能看到自己的 TENANT visibility 数据
--   5. CREATE TABLE IF NOT EXISTS 全部幂等，云端 Flyway 自动执行
-- =========================================================================

-- -------------------------------------------------------------------------
-- 表 1: t_ai_plan — Plan-and-Execute 双层规划主表
-- 作用：复杂任务先出 3-7 步执行计划，再执行；前端可显示步骤进度条
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_ai_plan` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `plan_uid` VARCHAR(64) NOT NULL COMMENT '计划业务UID',
    `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID（隔离基础）',
    `user_id` VARCHAR(64) DEFAULT NULL COMMENT '发起用户ID',
    `user_name` VARCHAR(100) DEFAULT NULL COMMENT '发起用户姓名',
    `session_id` VARCHAR(64) DEFAULT NULL COMMENT '关联 Agent 会话ID',
    `goal` TEXT COMMENT '用户目标原文',
    `plan_json` LONGTEXT COMMENT '计划步骤 JSON：[{step,action,tool,status,result}]',
    `total_steps` INT NOT NULL DEFAULT 0 COMMENT '总步骤数',
    `completed_steps` INT NOT NULL DEFAULT 0 COMMENT '已完成步骤数',
    `current_step` INT NOT NULL DEFAULT 0 COMMENT '当前执行步骤索引',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PLANNING' COMMENT '状态: PLANNING/EXECUTING/SUCCESS/FAILED/CANCELLED/REPLANNING',
    `visibility` VARCHAR(20) NOT NULL DEFAULT 'TENANT' COMMENT '可见性: TENANT/PLATFORM',
    `final_result` TEXT COMMENT '最终结果摘要',
    `error_message` TEXT COMMENT '错误信息',
    `total_tokens` INT DEFAULT 0 COMMENT '消耗 token 总数',
    `total_duration_ms` BIGINT DEFAULT 0 COMMENT '总执行耗时 ms',
    `replan_count` INT DEFAULT 0 COMMENT '重规划次数',
    `trace_id` VARCHAR(64) DEFAULT NULL COMMENT 'Langfuse trace ID',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_plan_uid` (`plan_uid`),
    KEY `idx_plan_tenant_create` (`tenant_id`, `create_time`),
    KEY `idx_plan_session` (`session_id`),
    KEY `idx_plan_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI Plan-and-Execute 计划主表';

-- -------------------------------------------------------------------------
-- 表 2: t_ai_process_reward — 过程奖励 PRM 评分表
-- 作用：为每个工具调用打分，累积成 AgentTool 排行榜，让 AI 越用越准
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_ai_process_reward` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
    `session_id` VARCHAR(64) DEFAULT NULL COMMENT '会话ID',
    `plan_id` BIGINT DEFAULT NULL COMMENT '关联计划ID（可空）',
    `step_index` INT DEFAULT NULL COMMENT '步骤索引',
    `tool_name` VARCHAR(100) DEFAULT NULL COMMENT '工具名',
    `tool_input` MEDIUMTEXT COMMENT '工具入参（脱敏后）',
    `tool_output_summary` TEXT COMMENT '工具结果摘要',
    `score` TINYINT NOT NULL DEFAULT 0 COMMENT '过程奖励分: -2~+2',
    `score_reason` VARCHAR(500) DEFAULT NULL COMMENT '评分理由',
    `score_source` VARCHAR(20) NOT NULL DEFAULT 'AUTO' COMMENT '评分来源: AUTO/CRITIC/USER/HEURISTIC',
    `outcome` VARCHAR(30) DEFAULT NULL COMMENT '结果分类: USEFUL/IRRELEVANT/ERROR/PARTIAL',
    `duration_ms` INT DEFAULT 0 COMMENT '工具耗时',
    `token_cost` INT DEFAULT 0 COMMENT '消耗 token',
    `scene` VARCHAR(50) DEFAULT NULL COMMENT '业务场景标签',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_reward_tenant_tool` (`tenant_id`, `tool_name`, `create_time`),
    KEY `idx_reward_session` (`session_id`),
    KEY `idx_reward_plan` (`plan_id`),
    KEY `idx_reward_scene` (`scene`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 过程奖励 PRM 评分';

-- -------------------------------------------------------------------------
-- 表 3: t_ai_long_memory — 三层长期记忆（事实/过程/反思）
-- 作用：跨对话沉淀经验。client_a 经常砍价、factory_b 周三常缺货 等
-- scope: TENANT(租户内复用) / PLATFORM_GLOBAL(跨租户匿名经验，仅超管聚合用)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_ai_long_memory` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `memory_uid` VARCHAR(64) NOT NULL COMMENT '记忆UID',
    `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID（NULL=平台全局事实）',
    `scope` VARCHAR(20) NOT NULL DEFAULT 'TENANT' COMMENT '范围: TENANT/PLATFORM_GLOBAL',
    `layer` VARCHAR(20) NOT NULL DEFAULT 'FACT' COMMENT '层级: FACT/EPISODIC/REFLECTIVE',
    `subject_type` VARCHAR(50) DEFAULT NULL COMMENT '主体类型: customer/supplier/style/factory/process/material',
    `subject_id` VARCHAR(64) DEFAULT NULL COMMENT '主体ID',
    `subject_name` VARCHAR(200) DEFAULT NULL COMMENT '主体名称',
    `content` TEXT NOT NULL COMMENT '记忆内容',
    `embedding_id` VARCHAR(100) DEFAULT NULL COMMENT 'Qdrant 向量ID',
    `confidence` DECIMAL(5,2) DEFAULT 80.00 COMMENT '置信度 0-100',
    `hit_count` INT DEFAULT 0 COMMENT '被检索命中次数',
    `last_hit_time` DATETIME DEFAULT NULL COMMENT '最后命中时间',
    `source_session_id` VARCHAR(64) DEFAULT NULL COMMENT '来源会话',
    `source_user_id` VARCHAR(64) DEFAULT NULL COMMENT '来源用户',
    `verified` TINYINT(1) DEFAULT 0 COMMENT '是否经人工确认',
    `expire_time` DATETIME DEFAULT NULL COMMENT '过期时间（可空=永久）',
    `delete_flag` INT NOT NULL DEFAULT 0 COMMENT '删除标志',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_memory_uid` (`memory_uid`),
    KEY `idx_mem_tenant_subj` (`tenant_id`, `layer`, `subject_type`, `subject_id`),
    KEY `idx_mem_scope_layer` (`scope`, `layer`),
    KEY `idx_mem_hit` (`tenant_id`, `hit_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 长期记忆三层架构';

-- -------------------------------------------------------------------------
-- 表 4: t_ai_decision_card — 可解释决策卡
-- 作用：每条 AI 建议附带 "数据依据 + 推理路径 + 不确定性"，让人敢信 AI
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_ai_decision_card` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `card_uid` VARCHAR(64) NOT NULL COMMENT '卡片UID',
    `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
    `user_id` VARCHAR(64) DEFAULT NULL COMMENT '发起用户ID',
    `session_id` VARCHAR(64) DEFAULT NULL COMMENT '会话ID',
    `plan_id` BIGINT DEFAULT NULL COMMENT '关联计划ID',
    `scene` VARCHAR(50) DEFAULT NULL COMMENT '业务场景',
    `question` TEXT COMMENT '用户问题',
    `recommendation` TEXT COMMENT 'AI 建议',
    `data_evidence_json` LONGTEXT COMMENT '数据依据 JSON：表/条件/样本',
    `reasoning_path_json` LONGTEXT COMMENT '推理路径 JSON：工具序列+中间结论',
    `uncertainty_json` LONGTEXT COMMENT '不确定性 JSON：假设+置信度',
    `confidence` DECIMAL(5,2) DEFAULT 70.00 COMMENT '总体置信度 0-100',
    `risk_level` VARCHAR(20) DEFAULT 'LOW' COMMENT '风险等级: LOW/MEDIUM/HIGH',
    `trace_id` VARCHAR(64) DEFAULT NULL COMMENT 'Langfuse trace',
    `adopted` TINYINT NOT NULL DEFAULT 0 COMMENT '采纳状态: 0=未处理 1=采纳 -1=拒绝',
    `adoption_time` DATETIME DEFAULT NULL COMMENT '采纳时间',
    `adoption_reason` VARCHAR(500) DEFAULT NULL COMMENT '采纳/拒绝原因',
    `feedback_score` TINYINT DEFAULT NULL COMMENT '用户评分 -2~+2',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_card_uid` (`card_uid`),
    KEY `idx_card_tenant_create` (`tenant_id`, `create_time`),
    KEY `idx_card_session` (`session_id`),
    KEY `idx_card_adopted` (`tenant_id`, `adopted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 可解释决策卡';

-- -------------------------------------------------------------------------
-- 表 5: t_ai_patrol_action — 主动巡检闭环行动
-- 作用：巡检发现问题 → 生成命令 → 自动/审批执行 → 跟踪到关闭，统计 MTTR
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_ai_patrol_action` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `action_uid` VARCHAR(64) NOT NULL COMMENT '行动UID',
    `tenant_id` BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID',
    `patrol_source` VARCHAR(50) DEFAULT NULL COMMENT '巡检源: AiPatrolJob/AnomalyDetection/Manual',
    `detected_issue` TEXT COMMENT '发现问题描述',
    `issue_type` VARCHAR(50) DEFAULT NULL COMMENT '问题类型: ORDER_OVERDUE/MATERIAL_SHORT/PROCESS_STAGNANT/QUALITY_DEFECT 等',
    `issue_severity` VARCHAR(20) NOT NULL DEFAULT 'MEDIUM' COMMENT '严重度: LOW/MEDIUM/HIGH/CRITICAL',
    `target_type` VARCHAR(50) DEFAULT NULL COMMENT '目标对象类型: order/material/process/factory',
    `target_id` VARCHAR(64) DEFAULT NULL COMMENT '目标对象ID',
    `suggested_action_json` LONGTEXT COMMENT '建议动作命令 JSON',
    `confidence` DECIMAL(5,2) DEFAULT 70.00 COMMENT '置信度 0-100',
    `risk_level` VARCHAR(20) NOT NULL DEFAULT 'NEED_APPROVAL' COMMENT '风险: AUTO_EXEC/NEED_APPROVAL/HUMAN_ONLY',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/APPROVED/REJECTED/EXECUTED/CLOSED/AUTO_EXECUTED',
    `auto_executed` TINYINT(1) DEFAULT 0 COMMENT '是否自动执行',
    `execution_result` TEXT COMMENT '执行结果',
    `execution_time` DATETIME DEFAULT NULL COMMENT '执行时间',
    `approver_id` VARCHAR(64) DEFAULT NULL COMMENT '审批人ID',
    `approver_name` VARCHAR(100) DEFAULT NULL COMMENT '审批人姓名',
    `approval_time` DATETIME DEFAULT NULL COMMENT '审批时间',
    `approval_remark` VARCHAR(500) DEFAULT NULL COMMENT '审批备注',
    `close_time` DATETIME DEFAULT NULL COMMENT '关闭时间',
    `mttr_minutes` INT DEFAULT NULL COMMENT '从发现到关闭分钟数',
    `linked_audit_id` VARCHAR(32) DEFAULT NULL COMMENT '关联 t_intelligence_audit_log',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_action_uid` (`action_uid`),
    KEY `idx_patrol_tenant_status` (`tenant_id`, `status`, `create_time`),
    KEY `idx_patrol_type_severity` (`issue_type`, `issue_severity`),
    KEY `idx_patrol_target` (`target_type`, `target_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 主动巡检闭环行动';

-- -------------------------------------------------------------------------
-- 表 6: t_ai_platform_aggregate — 平台聚合统计（仅超管/云裳智链可见）
-- 作用：跨租户匿名聚合 工具命中率/采纳率/MTTR/工序基准 等，作为平台级护城河
-- 注意：所有租户数据的统计沉淀，普通租户接口禁止读取此表
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `t_ai_platform_aggregate` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `metric_key` VARCHAR(100) NOT NULL COMMENT '指标键: tool.hit_rate/agent.adoption_rate/patrol.mttr/process.benchmark',
    `metric_dim` VARCHAR(200) DEFAULT NULL COMMENT '维度: 如 tool=tool_order_query',
    `period` VARCHAR(20) NOT NULL DEFAULT 'DAY' COMMENT '周期: DAY/WEEK/MONTH',
    `period_start` DATETIME NOT NULL COMMENT '周期起',
    `period_end` DATETIME NOT NULL COMMENT '周期止',
    `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID（NULL=跨租户聚合）',
    `metric_value` DECIMAL(20,4) DEFAULT NULL COMMENT '指标值',
    `metric_count` BIGINT DEFAULT 0 COMMENT '样本量',
    `metric_min` DECIMAL(20,4) DEFAULT NULL COMMENT '最小值',
    `metric_max` DECIMAL(20,4) DEFAULT NULL COMMENT '最大值',
    `metric_p50` DECIMAL(20,4) DEFAULT NULL COMMENT 'P50',
    `metric_p90` DECIMAL(20,4) DEFAULT NULL COMMENT 'P90',
    `extra_json` LONGTEXT COMMENT '额外维度 JSON',
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_metric_dim_period_tenant` (`metric_key`, `metric_dim`, `period`, `period_start`, `tenant_id`),
    KEY `idx_agg_metric_period` (`metric_key`, `period_start`),
    KEY `idx_agg_tenant` (`tenant_id`, `metric_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 平台级聚合统计（仅超管可见）';
