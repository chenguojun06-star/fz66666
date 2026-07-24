-- V202607230001: 创建 AI 升级平台 5 张表
--
-- 背景：
--   AI 数字员工 / 视觉 AI / AI 资产 / 排产优化 / 数字孪生 五大升级方向基础设施表。
--   用于支撑服装供应链的 AI 化能力落地：
--     1. t_browser_agent_task       — AI 浏览器代理任务（数字员工自动操作电商后台）
--     2. t_visual_ai_inspection     — 视觉 AI 检测记录（面料疵点/工艺单OCR/成品质量/对色）
--     3. t_fashion_ai_asset         — 服装 AI 资产（商拍/设计稿/虚拟试衣/模特图/平铺图）
--     4. t_scheduling_optimization  — 智能排产优化（RL训练/启发式/What-If仿真）
--     5. t_digital_twin_snapshot    — 数字孪生快照（实时/What-If/预测/历史仿真）
--
-- 多租户隔离（P0 铁律 4）：所有表必含 tenant_id，所有查询带 tenant_id WHERE
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在；
--   动态 SQL 内禁止字符串字面量 COMMENT，用独立 ALTER TABLE 回填注释
-- CHARSET=utf8mb4（支持 Emoji / 中文标点）

-- =============================================
-- 1. 创建 t_browser_agent_task 表（AI 浏览器代理任务表）
-- =============================================
SET @t1_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_browser_agent_task');
SET @s_create_t1 = IF(@t1_exists=0,
    'CREATE TABLE t_browser_agent_task (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        task_name VARCHAR(128) NOT NULL,
        task_type VARCHAR(32) NOT NULL,
        platform VARCHAR(32) NOT NULL,
        target_url VARCHAR(512) NULL DEFAULT NULL,
        action_steps TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT ''PENDING'',
        result TEXT NULL DEFAULT NULL,
        error_message TEXT NULL DEFAULT NULL,
        screenshot_urls TEXT NULL DEFAULT NULL,
        created_by VARCHAR(64) NULL DEFAULT NULL,
        executed_at DATETIME NULL DEFAULT NULL,
        completed_at DATETIME NULL DEFAULT NULL,
        retry_count INT NOT NULL DEFAULT 0,
        max_retry INT NOT NULL DEFAULT 3,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant_status (tenant_id, status),
        KEY idx_tenant_type (tenant_id, task_type),
        KEY idx_tenant_platform (tenant_id, platform)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create_t1 FROM @s_create_t1; EXECUTE stmt_create_t1; DEALLOCATE PREPARE stmt_create_t1;

-- 回填表/列注释（D-004：动态 SQL 内禁止字符串字面量，用独立语句）
ALTER TABLE t_browser_agent_task COMMENT 'AI浏览器代理任务表（数字员工自动操作电商后台）';
ALTER TABLE t_browser_agent_task MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_browser_agent_task MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_browser_agent_task MODIFY COLUMN task_name VARCHAR(128) NOT NULL COMMENT '任务名称';
ALTER TABLE t_browser_agent_task MODIFY COLUMN task_type VARCHAR(32) NOT NULL COMMENT '任务类型：AUTO_LISTING/AUTO_REFUND/AUTO_STOCK_SYNC/AUTO_REPLY/AUTO_PRICE_ADJUST';
ALTER TABLE t_browser_agent_task MODIFY COLUMN platform VARCHAR(32) NOT NULL COMMENT '平台：TAOBAO/JDOUYIN/WECHAT/CUSTOM';
ALTER TABLE t_browser_agent_task MODIFY COLUMN target_url VARCHAR(512) NULL DEFAULT NULL COMMENT '目标URL';
ALTER TABLE t_browser_agent_task MODIFY COLUMN action_steps TEXT NOT NULL COMMENT '操作步骤JSON数组：[{step,action,selector,value}]';
ALTER TABLE t_browser_agent_task MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/RUNNING/SUCCESS/FAILED/CANCELLED';
ALTER TABLE t_browser_agent_task MODIFY COLUMN result TEXT NULL DEFAULT NULL COMMENT '执行结果JSON';
ALTER TABLE t_browser_agent_task MODIFY COLUMN error_message TEXT NULL DEFAULT NULL COMMENT '错误信息';
ALTER TABLE t_browser_agent_task MODIFY COLUMN screenshot_urls TEXT NULL DEFAULT NULL COMMENT '截图URLs，逗号分隔';
ALTER TABLE t_browser_agent_task MODIFY COLUMN created_by VARCHAR(64) NULL DEFAULT NULL COMMENT '创建人';
ALTER TABLE t_browser_agent_task MODIFY COLUMN executed_at DATETIME NULL DEFAULT NULL COMMENT '执行时间';
ALTER TABLE t_browser_agent_task MODIFY COLUMN completed_at DATETIME NULL DEFAULT NULL COMMENT '完成时间';
ALTER TABLE t_browser_agent_task MODIFY COLUMN retry_count INT NOT NULL DEFAULT 0 COMMENT '已重试次数';
ALTER TABLE t_browser_agent_task MODIFY COLUMN max_retry INT NOT NULL DEFAULT 3 COMMENT '最大重试次数';
ALTER TABLE t_browser_agent_task MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 2. 创建 t_visual_ai_inspection 表（视觉 AI 检测记录表）
-- =============================================
SET @t2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_visual_ai_inspection');
SET @s_create_t2 = IF(@t2_exists=0,
    'CREATE TABLE t_visual_ai_inspection (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        inspection_type VARCHAR(32) NOT NULL,
        image_url VARCHAR(512) NOT NULL,
        thumbnail_url VARCHAR(512) NULL DEFAULT NULL,
        order_no VARCHAR(64) NULL DEFAULT NULL,
        style_no VARCHAR(64) NULL DEFAULT NULL,
        result TEXT NOT NULL,
        defect_count INT NOT NULL DEFAULT 0,
        quality_score DECIMAL(5,2) NULL DEFAULT NULL,
        confidence DECIMAL(5,2) NULL DEFAULT NULL,
        status VARCHAR(16) NOT NULL DEFAULT ''PENDING'',
        reviewed_by VARCHAR(64) NULL DEFAULT NULL,
        reviewed_at DATETIME NULL DEFAULT NULL,
        review_result VARCHAR(16) NULL DEFAULT NULL,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant_type (tenant_id, inspection_type),
        KEY idx_tenant_order (tenant_id, order_no),
        KEY idx_tenant_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create_t2 FROM @s_create_t2; EXECUTE stmt_create_t2; DEALLOCATE PREPARE stmt_create_t2;

-- 回填表/列注释
ALTER TABLE t_visual_ai_inspection COMMENT '视觉AI检测记录表（面料疵点/工艺单OCR/成品质量/对色）';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN inspection_type VARCHAR(32) NOT NULL COMMENT '检测类型：FABRIC_DEFECT/PROCESS_SHEET_OCR/FINISHED_QUALITY/COLOR_MATCH';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN image_url VARCHAR(512) NOT NULL COMMENT '检测图片URL';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN thumbnail_url VARCHAR(512) NULL DEFAULT NULL COMMENT '缩略图URL';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN order_no VARCHAR(64) NULL DEFAULT NULL COMMENT '关联订单号';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN style_no VARCHAR(64) NULL DEFAULT NULL COMMENT '关联款号';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN result TEXT NOT NULL COMMENT '检测结果JSON：defects数组/识别文本/质量评分等';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN defect_count INT NOT NULL DEFAULT 0 COMMENT '疵点数量';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN quality_score DECIMAL(5,2) NULL DEFAULT NULL COMMENT '质量评分0-100';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN confidence DECIMAL(5,2) NULL DEFAULT NULL COMMENT '置信度0-100';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/PROCESSING/SUCCESS/FAILED';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN reviewed_by VARCHAR(64) NULL DEFAULT NULL COMMENT '审核人';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN reviewed_at DATETIME NULL DEFAULT NULL COMMENT '审核时间';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN review_result VARCHAR(16) NULL DEFAULT NULL COMMENT '审核结果：APPROVED/REJECTED/NEED_RECHECK';
ALTER TABLE t_visual_ai_inspection MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 3. 创建 t_fashion_ai_asset 表（服装 AI 资产表）
-- =============================================
SET @t3_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_fashion_ai_asset');
SET @s_create_t3 = IF(@t3_exists=0,
    'CREATE TABLE t_fashion_ai_asset (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        asset_type VARCHAR(32) NOT NULL,
        style_no VARCHAR(64) NULL DEFAULT NULL,
        sku_code VARCHAR(64) NULL DEFAULT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT NULL DEFAULT NULL,
        model_name VARCHAR(64) NULL DEFAULT NULL,
        image_url VARCHAR(512) NOT NULL,
        thumbnail_url VARCHAR(512) NULL DEFAULT NULL,
        metadata TEXT NULL DEFAULT NULL,
        quality_rating INT NULL DEFAULT NULL,
        approved TINYINT(1) NOT NULL DEFAULT 0,
        approved_by VARCHAR(64) NULL DEFAULT NULL,
        approved_at DATETIME NULL DEFAULT NULL,
        usage_count INT NOT NULL DEFAULT 0,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant_type (tenant_id, asset_type),
        KEY idx_tenant_style (tenant_id, style_no),
        KEY idx_tenant_approved (tenant_id, approved)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create_t3 FROM @s_create_t3; EXECUTE stmt_create_t3; DEALLOCATE PREPARE stmt_create_t3;

-- 回填表/列注释
ALTER TABLE t_fashion_ai_asset COMMENT '服装AI资产表（AI商拍/设计稿/虚拟试衣/模特图/平铺图）';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN asset_type VARCHAR(32) NOT NULL COMMENT '资产类型：AI_COMMERCIAL_PHOTO/AI_DESIGN_DRAFT/VIRTUAL_TRYON/AI_MODEL_IMAGE/AI_FLAT_LAYOUT';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN style_no VARCHAR(64) NULL DEFAULT NULL COMMENT '关联款号';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN sku_code VARCHAR(64) NULL DEFAULT NULL COMMENT '关联SKU';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN prompt TEXT NOT NULL COMMENT '生成提示词';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN negative_prompt TEXT NULL DEFAULT NULL COMMENT '反向提示词';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN model_name VARCHAR(64) NULL DEFAULT NULL COMMENT '使用的AI模型';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN image_url VARCHAR(512) NOT NULL COMMENT '生成图片URL';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN thumbnail_url VARCHAR(512) NULL DEFAULT NULL COMMENT '缩略图URL';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN metadata TEXT NULL DEFAULT NULL COMMENT '元数据JSON：角度/光线/背景/模特等';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN quality_rating INT NULL DEFAULT NULL COMMENT '质量评分1-5';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN approved TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否审核通过：0=未通过 1=已通过';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN approved_by VARCHAR(64) NULL DEFAULT NULL COMMENT '审核人';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN approved_at DATETIME NULL DEFAULT NULL COMMENT '审核时间';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN usage_count INT NOT NULL DEFAULT 0 COMMENT '使用次数';
ALTER TABLE t_fashion_ai_asset MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 4. 创建 t_scheduling_optimization 表（智能排产优化记录表）
-- =============================================
SET @t4_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scheduling_optimization');
SET @s_create_t4 = IF(@t4_exists=0,
    'CREATE TABLE t_scheduling_optimization (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        optimization_type VARCHAR(32) NOT NULL,
        factory_id BIGINT NULL DEFAULT NULL,
        input_data TEXT NOT NULL,
        output_data TEXT NOT NULL,
        score DECIMAL(5,2) NULL DEFAULT NULL,
        algorithm VARCHAR(32) NOT NULL DEFAULT ''WEIGHTED'',
        iteration_count INT NOT NULL DEFAULT 0,
        training_episodes INT NOT NULL DEFAULT 0,
        reward_score DECIMAL(8,2) NULL DEFAULT NULL,
        status VARCHAR(16) NOT NULL DEFAULT ''PENDING'',
        applied TINYINT(1) NOT NULL DEFAULT 0,
        applied_at DATETIME NULL DEFAULT NULL,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant_factory (tenant_id, factory_id),
        KEY idx_tenant_type (tenant_id, optimization_type),
        KEY idx_tenant_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create_t4 FROM @s_create_t4; EXECUTE stmt_create_t4; DEALLOCATE PREPARE stmt_create_t4;

-- 回填表/列注释
ALTER TABLE t_scheduling_optimization COMMENT '智能排产优化记录表（RL训练/启发式/What-If仿真）';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN optimization_type VARCHAR(32) NOT NULL COMMENT '优化类型：RL_TRAINING/HEURISTIC/WHAT_IF_SIMULATION';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN factory_id BIGINT NULL DEFAULT NULL COMMENT '工厂ID';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN input_data TEXT NOT NULL COMMENT '输入数据JSON：订单列表/产能/工序等';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN output_data TEXT NOT NULL COMMENT '输出数据JSON：排产方案';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN score DECIMAL(5,2) NULL DEFAULT NULL COMMENT '优化评分';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN algorithm VARCHAR(32) NOT NULL DEFAULT 'WEIGHTED' COMMENT '算法：WEIGHTED/RL/GENETIC/SIMULATED_ANNEALING';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN iteration_count INT NOT NULL DEFAULT 0 COMMENT '迭代次数';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN training_episodes INT NOT NULL DEFAULT 0 COMMENT '训练轮次（RL专用）';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN reward_score DECIMAL(8,2) NULL DEFAULT NULL COMMENT '奖励分数（RL专用）';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/RUNNING/SUCCESS/FAILED';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN applied TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已应用到生产：0=未应用 1=已应用';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN applied_at DATETIME NULL DEFAULT NULL COMMENT '应用时间';
ALTER TABLE t_scheduling_optimization MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 5. 创建 t_digital_twin_snapshot 表（数字孪生快照表）
-- =============================================
SET @t5_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_digital_twin_snapshot');
SET @s_create_t5 = IF(@t5_exists=0,
    'CREATE TABLE t_digital_twin_snapshot (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        snapshot_type VARCHAR(32) NOT NULL,
        scope VARCHAR(32) NOT NULL,
        target_id BIGINT NULL DEFAULT NULL,
        snapshot_data TEXT NOT NULL,
        simulation_result TEXT NULL DEFAULT NULL,
        health_score DECIMAL(5,2) NULL DEFAULT NULL,
        bottleneck_list TEXT NULL DEFAULT NULL,
        prediction_data TEXT NULL DEFAULT NULL,
        scenario_name VARCHAR(128) NULL DEFAULT NULL,
        scenario_params TEXT NULL DEFAULT NULL,
        status VARCHAR(16) NOT NULL DEFAULT ''COMPLETED'',
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tenant_scope (tenant_id, scope),
        KEY idx_tenant_type (tenant_id, snapshot_type),
        KEY idx_tenant_target (tenant_id, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create_t5 FROM @s_create_t5; EXECUTE stmt_create_t5; DEALLOCATE PREPARE stmt_create_t5;

-- 回填表/列注释
ALTER TABLE t_digital_twin_snapshot COMMENT '数字孪生快照表（实时/What-If/预测/历史仿真）';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN snapshot_type VARCHAR(32) NOT NULL COMMENT '快照类型：REAL_TIME/WHAT_IF/PREDICTIVE/HISTORICAL';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN scope VARCHAR(32) NOT NULL COMMENT '范围：FULL_SUPPLY_CHAIN/FACTORY/WAREHOUSE/ORDER';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN target_id BIGINT NULL DEFAULT NULL COMMENT '目标ID：工厂ID/仓库ID/订单ID';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN snapshot_data TEXT NOT NULL COMMENT '快照数据JSON';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN simulation_result TEXT NULL DEFAULT NULL COMMENT '仿真结果JSON';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN health_score DECIMAL(5,2) NULL DEFAULT NULL COMMENT '健康评分0-100';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN bottleneck_list TEXT NULL DEFAULT NULL COMMENT '瓶颈列表JSON';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN prediction_data TEXT NULL DEFAULT NULL COMMENT '预测数据JSON';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN scenario_name VARCHAR(128) NULL DEFAULT NULL COMMENT '场景名称（What-If专用）';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN scenario_params TEXT NULL DEFAULT NULL COMMENT '场景参数JSON';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED' COMMENT '状态：COMPLETED/PROCESSING/FAILED';
ALTER TABLE t_digital_twin_snapshot MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';
