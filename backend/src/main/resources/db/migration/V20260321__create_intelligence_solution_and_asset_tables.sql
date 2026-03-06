-- 智能化补齐：方案库、效果回流、工厂能力矩阵、经营目标、推送效果、工人成长、工厂异常案例
-- 云端 FLYWAY_ENABLED=false，此脚本需手动在微信云托管控制台执行

CREATE TABLE IF NOT EXISTS t_intelligence_solution_playbook (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL DEFAULT 0 COMMENT '租户ID，0=系统默认模板',
    pain_code VARCHAR(64) NOT NULL COMMENT '对应痛点编码',
    solution_code VARCHAR(64) NOT NULL COMMENT '方案编码',
    solution_title VARCHAR(128) NOT NULL COMMENT '方案标题',
    action_steps TEXT COMMENT '处理步骤',
    owner_role VARCHAR(64) DEFAULT NULL COMMENT '建议责任角色',
    expected_days INT DEFAULT NULL COMMENT '预期见效天数',
    effect_score DECIMAL(5,2) DEFAULT NULL COMMENT '当前效果分',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    source_type VARCHAR(16) NOT NULL DEFAULT 'SYSTEM' COMMENT 'SYSTEM/TENANT/MANUAL',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_isp_tenant_pain_solution (tenant_id, pain_code, solution_code),
    KEY idx_isp_tenant_id (tenant_id),
    KEY idx_isp_pain_code (pain_code),
    KEY idx_isp_enabled (enabled)
) COMMENT='智能化问题解决方案库';

CREATE TABLE IF NOT EXISTS t_intelligence_solution_effect (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    solution_code VARCHAR(64) NOT NULL COMMENT '方案编码',
    pain_code VARCHAR(64) NOT NULL COMMENT '痛点编码',
    target_id VARCHAR(64) DEFAULT NULL COMMENT '订单/工厂/工人等对象ID',
    target_type VARCHAR(32) NOT NULL COMMENT 'ORDER/FACTORY/WORKER/TENANT',
    before_metric DECIMAL(12,2) DEFAULT NULL COMMENT '处理前指标',
    after_metric DECIMAL(12,2) DEFAULT NULL COMMENT '处理后指标',
    improved TINYINT(1) DEFAULT NULL COMMENT '是否改善',
    evaluation_note VARCHAR(500) DEFAULT NULL COMMENT '评价说明',
    evaluated_by VARCHAR(64) DEFAULT NULL COMMENT '评价人ID',
    evaluated_name VARCHAR(100) DEFAULT NULL COMMENT '评价人姓名',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    KEY idx_ise_tenant_id (tenant_id),
    KEY idx_ise_solution_code (solution_code),
    KEY idx_ise_pain_code (pain_code),
    KEY idx_ise_target_type (target_type)
) COMMENT='智能化方案效果回流记录';

CREATE TABLE IF NOT EXISTS t_factory_skill_matrix (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    factory_id VARCHAR(36) NOT NULL COMMENT '工厂ID',
    category VARCHAR(64) NOT NULL DEFAULT '' COMMENT '品类',
    style_type VARCHAR(64) NOT NULL DEFAULT '' COMMENT '款式类型',
    process_code VARCHAR(64) NOT NULL DEFAULT '' COMMENT '工序编码',
    delivery_score DECIMAL(5,2) DEFAULT NULL COMMENT '交期稳定分',
    quality_score DECIMAL(5,2) DEFAULT NULL COMMENT '质量稳定分',
    margin_score DECIMAL(5,2) DEFAULT NULL COMMENT '毛利适配分',
    efficiency_score DECIMAL(5,2) DEFAULT NULL COMMENT '效率分',
    sample_count INT NOT NULL DEFAULT 0 COMMENT '样本数',
    last_calc_time DATETIME DEFAULT NULL COMMENT '最近计算时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_fsm_tenant_factory_dim (tenant_id, factory_id, category, style_type, process_code),
    KEY idx_fsm_factory_id (factory_id),
    KEY idx_fsm_tenant_id (tenant_id),
    KEY idx_fsm_process_code (process_code)
) COMMENT='工厂能力矩阵';

CREATE TABLE IF NOT EXISTS t_tenant_business_goal (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    goal_year INT NOT NULL COMMENT '目标年度',
    goal_month INT NOT NULL DEFAULT 0 COMMENT '目标月份，0=年度目标',
    delivery_target_rate DECIMAL(5,2) DEFAULT NULL COMMENT '准交率目标',
    gross_margin_target DECIMAL(5,2) DEFAULT NULL COMMENT '毛利率目标',
    cash_recovery_days_target INT DEFAULT NULL COMMENT '回款天数目标',
    inventory_turnover_target DECIMAL(8,2) DEFAULT NULL COMMENT '库存周转目标',
    worker_efficiency_target DECIMAL(8,2) DEFAULT NULL COMMENT '人效目标',
    enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用',
    remark VARCHAR(255) DEFAULT NULL COMMENT '备注',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_tbg_tenant_period (tenant_id, goal_year, goal_month),
    KEY idx_tbg_tenant_id (tenant_id),
    KEY idx_tbg_enabled (enabled)
) COMMENT='租户经营目标配置';

CREATE TABLE IF NOT EXISTS t_mind_push_effect (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    push_log_id BIGINT NOT NULL COMMENT '推送日志ID',
    opened TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否打开',
    handled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否处理',
    handled_time DATETIME DEFAULT NULL COMMENT '处理时间',
    risk_before DECIMAL(8,2) DEFAULT NULL COMMENT '推送前风险值',
    risk_after DECIMAL(8,2) DEFAULT NULL COMMENT '推送后风险值',
    result_code VARCHAR(32) DEFAULT NULL COMMENT 'IMPROVED/NO_CHANGE/WORSE',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_mpe_push_log_id (push_log_id),
    KEY idx_mpe_tenant_id (tenant_id),
    KEY idx_mpe_result_code (result_code)
) COMMENT='主动推送效果跟踪';

CREATE TABLE IF NOT EXISTS t_worker_skill_growth (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    worker_id VARCHAR(36) NOT NULL COMMENT '工人ID',
    process_code VARCHAR(64) NOT NULL COMMENT '工序编码',
    current_level VARCHAR(32) DEFAULT NULL COMMENT '当前等级',
    speed_score DECIMAL(5,2) DEFAULT NULL COMMENT '速度分',
    quality_score DECIMAL(5,2) DEFAULT NULL COMMENT '质量分',
    stability_score DECIMAL(5,2) DEFAULT NULL COMMENT '稳定性分',
    training_count INT NOT NULL DEFAULT 0 COMMENT '训练次数',
    last_training_time DATETIME DEFAULT NULL COMMENT '最近训练时间',
    growth_trend VARCHAR(32) DEFAULT NULL COMMENT '成长趋势',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    UNIQUE KEY uk_wsg_worker_process (tenant_id, worker_id, process_code),
    KEY idx_wsg_tenant_id (tenant_id),
    KEY idx_wsg_worker_id (worker_id),
    KEY idx_wsg_process_code (process_code)
) COMMENT='工人成长与技能画像';

CREATE TABLE IF NOT EXISTS t_factory_exception_case (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    factory_id VARCHAR(36) NOT NULL COMMENT '工厂ID',
    case_type VARCHAR(64) NOT NULL COMMENT '异常类型',
    order_id VARCHAR(64) DEFAULT NULL COMMENT '订单ID',
    order_no VARCHAR(64) DEFAULT NULL COMMENT '订单号',
    reason_summary VARCHAR(500) DEFAULT NULL COMMENT '原因摘要',
    action_taken VARCHAR(500) DEFAULT NULL COMMENT '采取措施',
    resolved TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否解决',
    resolved_time DATETIME DEFAULT NULL COMMENT '解决时间',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag INT DEFAULT 0,
    KEY idx_fec_tenant_id (tenant_id),
    KEY idx_fec_factory_id (factory_id),
    KEY idx_fec_case_type (case_type),
    KEY idx_fec_resolved (resolved)
) COMMENT='工厂异常案例沉淀';
