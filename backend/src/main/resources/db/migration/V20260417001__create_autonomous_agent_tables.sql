-- ============================================================
-- V20260417001 — 自主Agent能力升级：决策记忆 + 根因分析 + 模式发现 + 目标拆解 + Agent例会
-- 5张新表，支撑阶段1-4（决策记忆→反思→例会）+ 阶段9（自主Agent）
-- ============================================================

-- 1. 决策记忆表 — 结构化记录「决策→行动→结果→教训」闭环
CREATE TABLE IF NOT EXISTS `t_decision_memory` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `decision_type` VARCHAR(50) NOT NULL COMMENT '决策类型: scheduling|pricing|sourcing|quality|delivery|escalation',
    `scene` VARCHAR(100) COMMENT '决策场景描述',
    `context_snapshot` TEXT COMMENT '决策时的上下文快照(JSON: 订单/工厂/物料状态)',
    `decision_content` TEXT NOT NULL COMMENT '决策内容(AI做了什么决定)',
    `rationale` TEXT COMMENT '决策理由(AI为什么这样决定)',
    `expected_outcome` VARCHAR(500) COMMENT '预期结果',
    `actual_outcome` VARCHAR(500) COMMENT '实际结果(回填)',
    `outcome_score` INT DEFAULT NULL COMMENT '结果评分0-100(回填)',
    `lesson_learned` TEXT COMMENT 'AI提炼的教训',
    `linked_order_ids` VARCHAR(2000) COMMENT '关联订单ID列表(逗号分隔)',
    `agent_source` VARCHAR(50) DEFAULT 'multi_agent_graph' COMMENT '决策来源: ai_agent|multi_agent_graph|patrol',
    `execution_id` VARCHAR(64) COMMENT '关联的agent_execution_log.id',
    `confidence_at_decision` INT COMMENT '决策时的置信分',
    `confidence_after_outcome` INT COMMENT '结果回填后的置信分',
    `status` VARCHAR(20) DEFAULT 'pending' COMMENT 'pending|outcome_recorded|lesson_extracted|archived',
    `delete_flag` INT DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_dm_tenant_type` (`tenant_id`, `decision_type`),
    INDEX `idx_dm_tenant_status` (`tenant_id`, `status`),
    INDEX `idx_dm_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='决策记忆-结构化闭环';

-- 2. 根因分析表 — 5-Why递归 + 鱼骨图 + 跨域关联
CREATE TABLE IF NOT EXISTS `t_root_cause_analysis` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `trigger_type` VARCHAR(50) NOT NULL COMMENT '触发类型: overdue|stagnant|quality_defect|cost_overrun|delivery_delay',
    `trigger_description` TEXT NOT NULL COMMENT '触发问题描述',
    `linked_order_ids` VARCHAR(2000) COMMENT '关联订单ID',
    `why_chain` TEXT COMMENT '5-Why递归链(JSON数组: [{level,question,answer,confidence}])',
    `root_cause` VARCHAR(500) COMMENT '根本原因(最终结论)',
    `root_cause_category` VARCHAR(50) COMMENT '根因分类: material|labor|machine|method|environment|management',
    `fishbone_data` TEXT COMMENT '鱼骨图数据(JSON: {people,process,material,equipment,environment,management})',
    `cross_domain_links` TEXT COMMENT '跨域关联(JSON: [{domain,entity,relation}])',
    `suggested_actions` TEXT COMMENT '建议行动(JSON数组)',
    `severity` VARCHAR(20) DEFAULT 'medium' COMMENT 'low|medium|high|critical',
    `status` VARCHAR(20) DEFAULT 'analyzing' COMMENT 'analyzing|concluded|action_taken|resolved',
    `resolution_note` VARCHAR(500) COMMENT '解决备注',
    `delete_flag` INT DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_rca_tenant_type` (`tenant_id`, `trigger_type`),
    INDEX `idx_rca_tenant_status` (`tenant_id`, `status`),
    INDEX `idx_rca_category` (`root_cause_category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='根因分析-5Why+鱼骨图';

-- 3. 模式发现表 — 时序模式 + 异常聚类 + 因果推断
CREATE TABLE IF NOT EXISTS `t_pattern_discovery` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `pattern_type` VARCHAR(50) NOT NULL COMMENT '模式类型: seasonal|correlation|anomaly_cluster|efficiency_trend|bottleneck_recurrence',
    `pattern_name` VARCHAR(200) NOT NULL COMMENT '模式名称(人类可读)',
    `description` TEXT COMMENT '模式详细描述',
    `evidence` TEXT COMMENT '支撑证据(JSON: [{metric,value,timestamp}])',
    `data_source` VARCHAR(100) COMMENT '数据来源: scan_record|production_order|material_stock|finance',
    `time_range_start` DATETIME COMMENT '模式时间范围起',
    `time_range_end` DATETIME COMMENT '模式时间范围止',
    `confidence` INT DEFAULT 50 COMMENT '模式置信度0-100',
    `impact_score` INT DEFAULT 50 COMMENT '影响力评分0-100',
    `recurrence_count` INT DEFAULT 1 COMMENT '出现次数',
    `last_seen` DATETIME COMMENT '最近一次出现',
    `suggested_action` TEXT COMMENT 'AI建议的应对策略',
    `is_actionable` TINYINT DEFAULT 1 COMMENT '是否可执行',
    `status` VARCHAR(20) DEFAULT 'discovered' COMMENT 'discovered|confirmed|applied|dismissed',
    `applied_result` VARCHAR(500) COMMENT '应用后的效果',
    `delete_flag` INT DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_pd_tenant_type` (`tenant_id`, `pattern_type`),
    INDEX `idx_pd_confidence` (`confidence` DESC),
    INDEX `idx_pd_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='模式发现-时序+聚类+因果';

-- 4. 目标拆解表 — 递归子目标树 + 进度追踪
CREATE TABLE IF NOT EXISTS `t_goal_decomposition` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `parent_goal_id` BIGINT DEFAULT NULL COMMENT '父目标ID(NULL=顶层目标)',
    `goal_type` VARCHAR(50) NOT NULL COMMENT '目标类型: business|production|quality|cost|delivery',
    `title` VARCHAR(200) NOT NULL COMMENT '目标标题',
    `description` TEXT COMMENT '目标详细描述',
    `metric_name` VARCHAR(100) COMMENT '衡量指标名(如: on_time_delivery_rate)',
    `metric_current` DECIMAL(10,2) COMMENT '当前指标值',
    `metric_target` DECIMAL(10,2) COMMENT '目标指标值',
    `metric_unit` VARCHAR(20) COMMENT '指标单位(%, 天, 件, 元)',
    `priority` VARCHAR(10) DEFAULT 'medium' COMMENT 'low|medium|high|critical',
    `deadline` DATETIME COMMENT '目标截止日期',
    `progress` INT DEFAULT 0 COMMENT '完成进度0-100',
    `ai_source` VARCHAR(50) COMMENT '来源: auto_discovered|user_defined|patrol_suggested',
    `linked_pattern_id` BIGINT COMMENT '关联的模式发现ID',
    `linked_rca_id` BIGINT COMMENT '关联的根因分析ID',
    `status` VARCHAR(20) DEFAULT 'active' COMMENT 'active|completed|cancelled|blocked',
    `completion_note` VARCHAR(500) COMMENT '完成总结',
    `delete_flag` INT DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_gd_tenant_type` (`tenant_id`, `goal_type`),
    INDEX `idx_gd_parent` (`parent_goal_id`),
    INDEX `idx_gd_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='目标拆解-递归子目标树';

-- 5. Agent例会表 — 多Agent辩论记录 + 共识决策
CREATE TABLE IF NOT EXISTS `t_agent_meeting` (
    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
    `tenant_id` BIGINT NOT NULL,
    `meeting_type` VARCHAR(50) NOT NULL COMMENT '例会类型: daily_standup|risk_review|decision_debate|retrospective',
    `topic` VARCHAR(300) NOT NULL COMMENT '会议主题',
    `participants` VARCHAR(500) COMMENT '参与Agent列表(JSON数组: ["supervisor","delivery_specialist",...])',
    `agenda` TEXT COMMENT '议程(JSON数组)',
    `debate_rounds` TEXT COMMENT '辩论轮次(JSON: [{round,speaker,position,argument,evidence}])',
    `consensus` TEXT COMMENT '最终共识(结论文本)',
    `dissent` TEXT COMMENT '保留意见(少数派观点)',
    `action_items` TEXT COMMENT '决议行动项(JSON数组: [{assignee,task,deadline}])',
    `confidence_score` INT COMMENT '共识置信度0-100',
    `linked_decision_ids` VARCHAR(500) COMMENT '关联决策记忆ID',
    `linked_rca_ids` VARCHAR(500) COMMENT '关联根因分析ID',
    `duration_ms` BIGINT COMMENT '会议耗时(毫秒)',
    `status` VARCHAR(20) DEFAULT 'concluded' COMMENT 'in_progress|concluded|actions_pending|all_done',
    `delete_flag` INT DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_am_tenant_type` (`tenant_id`, `meeting_type`),
    INDEX `idx_am_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin COMMENT='Agent例会-辩论+共识';
