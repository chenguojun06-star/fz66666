-- =====================================================================
-- V202605021200: Hermes Agent 全套核心能力移植
-- 1. t_skill_template     — 对话复盘→自动生成技能（Skill Evolution）
-- 2. t_cron_job           — 自然语言定时任务（Cron Scheduler）
-- 3. t_conversation_reflection — 双LLM复盘闭环（Reflection Loop）
-- 4. t_session_search_index — 跨会话搜索+摘要（Session Search）
-- 5. t_agent_context_file — 项目上下文文件（AGENTS.md模式）
-- =====================================================================

-- 1. 技能模板表 — 对话复盘后自动生成的技能
CREATE TABLE IF NOT EXISTS `t_skill_template` (
  `id`               VARCHAR(64)   NOT NULL,
  `tenant_id`        BIGINT        DEFAULT NULL,
  `skill_name`       VARCHAR(128)  NOT NULL COMMENT '技能名称（slash命令用）',
  `skill_group`      VARCHAR(64)   DEFAULT 'custom' COMMENT '技能分组: production/finance/material/system/custom',
  `title`            VARCHAR(200)  NOT NULL COMMENT '技能标题',
  `description`      VARCHAR(500)  NOT NULL COMMENT '简短描述',
  `trigger_phrases`  VARCHAR(500)  DEFAULT NULL COMMENT '触发短语（逗号分隔），用户说这些时自动加载该技能',
  `steps_json`       TEXT          NOT NULL COMMENT '执行步骤（JSON数组），每步: {action, tool, params, description}',
  `pre_conditions`   VARCHAR(500)  DEFAULT NULL COMMENT '前置条件（逗号分隔）',
  `post_check`       VARCHAR(500)  DEFAULT NULL COMMENT '后置校验',
  `source`           VARCHAR(64)   DEFAULT 'auto' COMMENT '来源: auto(对话复盘)/manual(人工创建)/template(模板迁移)',
  `source_conversation_id` VARCHAR(64) DEFAULT NULL COMMENT '来源对话ID',
  `version`          INT           DEFAULT 1,
  `use_count`        INT           DEFAULT 0,
  `success_count`    INT           DEFAULT 0,
  `avg_rating`       DECIMAL(3,2)  DEFAULT 0.00 COMMENT '用户评分均值(1-5)',
  `confidence`       DECIMAL(3,2)  DEFAULT 0.50 COMMENT '技能置信度(0-1)，每次成功执行提升',
  `enabled`          TINYINT       DEFAULT 1,
  `delete_flag`      TINYINT       DEFAULT 0,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_skill_group` (`skill_group`, `enabled`, `delete_flag`),
  INDEX `idx_skill_tenant` (`tenant_id`, `delete_flag`),
  INDEX `idx_skill_confidence` (`confidence` DESC),
  FULLTEXT INDEX `idx_skill_trigger` (`trigger_phrases`, `description`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI技能模板（对话复盘自动生成）';

-- 2. 定时任务表
CREATE TABLE IF NOT EXISTS `t_cron_job` (
  `id`               VARCHAR(64)   NOT NULL,
  `tenant_id`        BIGINT        NOT NULL,
  `name`             VARCHAR(200)  NOT NULL COMMENT '任务名称',
  `cron_expression`  VARCHAR(100)  NOT NULL COMMENT 'cron表达式，也支持: @daily/@hourly/@weekly/@midnight',
  `natural_language` VARCHAR(500)  DEFAULT NULL COMMENT '自然语言描述（用户当初说的原文）',
  `task_type`        VARCHAR(32)   NOT NULL COMMENT '任务类型: check_overdue/generate_report/notify_remind/custom_skill',
  `task_prompt`      TEXT          NOT NULL COMMENT '任务提示词（传给小云执行的内容）',
  `skill_template_id` VARCHAR(64)  DEFAULT NULL COMMENT '关联技能模板ID',
  `notify_channels`  VARCHAR(200)  DEFAULT 'system' COMMENT '通知渠道: system/wechat/email（逗号分隔）',
  `notify_user_id`   VARCHAR(64)   DEFAULT NULL COMMENT '通知目标用户ID',
  `last_run_at`      DATETIME      DEFAULT NULL,
  `last_result`      VARCHAR(500)  DEFAULT NULL COMMENT '上次执行结果摘要',
  `success_count`    INT           DEFAULT 0,
  `fail_count`       INT           DEFAULT 0,
  `enabled`          TINYINT       DEFAULT 1,
  `delete_flag`      TINYINT       DEFAULT 0,
  `created_by`       VARCHAR(64)   DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cron_tenant` (`tenant_id`, `enabled`, `delete_flag`),
  INDEX `idx_cron_next` (`enabled`, `last_run_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI定时任务';

-- 预置默认定时任务
INSERT IGNORE INTO `t_cron_job` (`id`,`tenant_id`,`name`,`cron_expression`,`natural_language`,`task_type`,`task_prompt`,`enabled`) VALUES
('cron-default-check-overdue', 0, '每日逾期订单巡检', '0 8 * * *', '每天早上8点检查所有逾期订单', 'check_overdue',
 '检查所有计划交期在当前日期之前且状态不为completed的订单，列出逾期清单、逾期天数、责任工厂和跟单员，如果有紧急逾期（超过7天）则重点标注。', 0);

-- 3. 对话复盘记录表 — 双LLM闭环
CREATE TABLE IF NOT EXISTS `t_conversation_reflection` (
  `id`               VARCHAR(64)   NOT NULL,
  `tenant_id`        BIGINT        NOT NULL,
  `conversation_id`  VARCHAR(64)   NOT NULL COMMENT '关联对话ID',
  `session_id`       VARCHAR(64)   DEFAULT NULL,
  `user_message`     TEXT          DEFAULT NULL COMMENT '用户原始问题',
  `reflection_type`  VARCHAR(32)   NOT NULL COMMENT '复盘类型: post_turn/periodic/skill_extract/manual',
  `reflection_content` TEXT        NOT NULL COMMENT '复盘内容（LLM生成的改进建议）',
  `extracted_skill_id` VARCHAR(64) DEFAULT NULL COMMENT '提取的技能模板ID',
  `action_items`     TEXT          DEFAULT NULL COMMENT '改进行动项（JSON）',
  `quality_score`    DECIMAL(3,2)  DEFAULT NULL COMMENT '本轮对话质量评分(0-1)',
  `prompt_suggestion` TEXT         DEFAULT NULL COMMENT 'Prompt优化建议',
  `resolved`         TINYINT       DEFAULT 0 COMMENT '改进是否已执行',
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_reflection_conv` (`conversation_id`),
  INDEX `idx_reflection_tenant` (`tenant_id`, `resolved`),
  INDEX `idx_reflection_type` (`reflection_type`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI对话复盘记录';

-- 4. 会话搜索索引表 — 跨会话FTS搜索
CREATE TABLE IF NOT EXISTS `t_session_search_index` (
  `id`               VARCHAR(64)   NOT NULL,
  `tenant_id`        BIGINT        NOT NULL,
  `user_id`          VARCHAR(64)   DEFAULT NULL,
  `session_id`       VARCHAR(64)   NOT NULL,
  `conversation_id`  VARCHAR(64)   DEFAULT NULL,
  `user_message`     TEXT          NOT NULL COMMENT '用户原始消息',
  `assistant_summary` VARCHAR(1000) DEFAULT NULL COMMENT 'AI回复摘要（LLM生成，供搜索展示）',
  `key_entities`     VARCHAR(500)  DEFAULT NULL COMMENT '关键实体（订单号/款号/工厂名等，逗号分隔）',
  `intent_category`  VARCHAR(64)   DEFAULT NULL COMMENT '意图分类: order_query/progress_check/finance/material/sample',
  `resolved`         TINYINT       DEFAULT 1 COMMENT '问题是否已解决',
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ssi_session` (`session_id`, `created_at`),
  INDEX `idx_ssi_tenant_user` (`tenant_id`, `user_id`),
  INDEX `idx_ssi_entities` (`key_entities`(100)),
  FULLTEXT INDEX `idx_ssi_fulltext` (`user_message`, `assistant_summary`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI会话搜索索引';

-- 5. 上下文文件表 — AGENTS.md模式，项目上下文
CREATE TABLE IF NOT EXISTS `t_agent_context_file` (
  `id`               VARCHAR(64)   NOT NULL,
  `tenant_id`        BIGINT        NOT NULL,
  `file_name`        VARCHAR(128)  NOT NULL COMMENT '文件名（如 AGENTS.md, project_context.md）',
  `file_path`        VARCHAR(300)  DEFAULT NULL COMMENT '虚拟路径',
  `content`          TEXT          NOT NULL COMMENT '文件内容（Markdown）',
  `is_active`        TINYINT       DEFAULT 1 COMMENT '是否注入到每次对话',
  `priority`         INT           DEFAULT 0 COMMENT '注入优先级（越大越靠前）',
  `scope`            VARCHAR(32)   DEFAULT 'tenant' COMMENT '作用域: tenant/factory/user',
  `created_by`       VARCHAR(64)   DEFAULT NULL,
  `created_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_acf_tenant_active` (`tenant_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI上下文文件（AGENTS.md模式）';

-- 预置默认上下文文件
INSERT IGNORE INTO `t_agent_context_file` (`id`,`tenant_id`,`file_name`,`content`,`is_active`,`priority`,`scope`) VALUES
('acf-system-default', 0, 'SYSTEM.md',
'# 小云 AI 系统上下文

## 系统定位
小云是服装供应链的AI智能助手，能执行订单创建、进度查询、扫码追溯、工资结算、物料对账等全链路操作。

## 核心原则
- 多租户数据隔离，所有查询必须带 tenantId
- 6种下单方式：PC端手动/AI建单/裁剪下单/样衣推送/OpenAPI/复制
- 工序映射遵循 模板配置 > 动态映射表 > 兜底 的优先级
- 高风险操作（删除/结算/撤回）必须先确认
- 回答必须基于工具查询实时数据，不可编造

## 当前系统
- 后端: Spring Boot 3.4.5 + MyBatis-Plus + MySQL 8.0
- 前端: React 18 + TypeScript + Ant Design 5
- 模型: DeepSeek v4 Flash + 豆包视觉
- 向量库: Qdrant

## 能力清单
- 订单: 创建/查询/编辑/复制/关闭/催单
- 进度: 实时进度/工序追踪/菲号统计
- 扫码: 工序扫码/质检/入库/撤回
- 财务: 工资结算/物料对账/出货对账/利润
- 物料: 采购/入库/领料/库存
- 分析: 工厂排名/瓶颈分析/风险评估/推演沙盘',
1, 100, 'tenant');

SELECT CONCAT('Hermes 核心能力移植建表完成: 5张新表') AS result;
