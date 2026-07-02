-- V202607020001: 创建 t_agent_background_task 表（长时程Agent后台任务）
--
-- 背景：
--   长时程Agent需要在后台异步执行任务（如批量数据分析、报表生成、AI深度分析等），
--   用户提交任务后可以关闭页面，任务完成后通过站内通知提醒。
--
-- 核心能力：
--   - 任务队列：PENDING / RUNNING / COMPLETED / FAILED / CANCELLED
--   - 优先级调度：HIGH / MEDIUM / LOW
--   - 进度追踪：progress百分比 + current_step描述
--   - 失败重试：retry_count + max_retry + 指数退避
--   - 断点续跑：复用 t_agent_checkpoint 保存中间状态
--   - 多租户隔离：tenant_id + 每租户并发限流
--
-- 多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在；
--   动态 SQL 内禁止字符串字面量 COMMENT，用独立 ALTER TABLE 回填注释

-- =============================================
-- 1. 创建 t_agent_background_task 表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_agent_background_task');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_agent_background_task (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        task_id VARCHAR(64) NOT NULL,
        task_name VARCHAR(256) NOT NULL,
        task_type VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL,
        priority VARCHAR(16) NOT NULL,
        input_params_json TEXT NULL DEFAULT NULL,
        result_json TEXT NULL DEFAULT NULL,
        error_message TEXT NULL DEFAULT NULL,
        created_by VARCHAR(128) NULL DEFAULT NULL,
        assignee_user_id VARCHAR(64) NULL DEFAULT NULL,
        progress INT NOT NULL DEFAULT 0,
        current_step VARCHAR(256) NULL DEFAULT NULL,
        retry_count INT NOT NULL DEFAULT 0,
        max_retry INT NOT NULL DEFAULT 3,
        started_at DATETIME NULL DEFAULT NULL,
        completed_at DATETIME NULL DEFAULT NULL,
        timeout_seconds INT NOT NULL DEFAULT 1800,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_task_id (task_id),
        KEY idx_tenant_status (tenant_id, status),
        KEY idx_tenant_type (tenant_id, task_type),
        KEY idx_tenant_create_time (tenant_id, create_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

-- 回填表/列注释（D-004：动态 SQL 内禁止字符串字面量，用独立语句）
ALTER TABLE t_agent_background_task COMMENT '长时程Agent后台任务表';
ALTER TABLE t_agent_background_task MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_agent_background_task MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_agent_background_task MODIFY COLUMN task_id VARCHAR(64) NOT NULL COMMENT '任务唯一标识（UUID）';
ALTER TABLE t_agent_background_task MODIFY COLUMN task_name VARCHAR(256) NOT NULL COMMENT '任务名称';
ALTER TABLE t_agent_background_task MODIFY COLUMN task_type VARCHAR(64) NOT NULL COMMENT '任务类型：AI_ANALYSIS/BATCH_PROCESS/REPORT_GENERATION/STYLE_BOM_OCR等';
ALTER TABLE t_agent_background_task MODIFY COLUMN status VARCHAR(32) NOT NULL COMMENT '状态：PENDING/RUNNING/COMPLETED/FAILED/CANCELLED';
ALTER TABLE t_agent_background_task MODIFY COLUMN priority VARCHAR(16) NOT NULL COMMENT '优先级：HIGH/MEDIUM/LOW';
ALTER TABLE t_agent_background_task MODIFY COLUMN input_params_json TEXT NULL DEFAULT NULL COMMENT '输入参数JSON';
ALTER TABLE t_agent_background_task MODIFY COLUMN result_json TEXT NULL DEFAULT NULL COMMENT '执行结果JSON';
ALTER TABLE t_agent_background_task MODIFY COLUMN error_message TEXT NULL DEFAULT NULL COMMENT '错误信息（失败时）';
ALTER TABLE t_agent_background_task MODIFY COLUMN created_by VARCHAR(128) NULL DEFAULT NULL COMMENT '创建人用户ID';
ALTER TABLE t_agent_background_task MODIFY COLUMN assignee_user_id VARCHAR(64) NULL DEFAULT NULL COMMENT '指派接收通知的用户ID';
ALTER TABLE t_agent_background_task MODIFY COLUMN progress INT NOT NULL DEFAULT 0 COMMENT '进度百分比0-100';
ALTER TABLE t_agent_background_task MODIFY COLUMN current_step VARCHAR(256) NULL DEFAULT NULL COMMENT '当前执行步骤描述';
ALTER TABLE t_agent_background_task MODIFY COLUMN retry_count INT NOT NULL DEFAULT 0 COMMENT '已重试次数';
ALTER TABLE t_agent_background_task MODIFY COLUMN max_retry INT NOT NULL DEFAULT 3 COMMENT '最大重试次数';
ALTER TABLE t_agent_background_task MODIFY COLUMN started_at DATETIME NULL DEFAULT NULL COMMENT '开始执行时间';
ALTER TABLE t_agent_background_task MODIFY COLUMN completed_at DATETIME NULL DEFAULT NULL COMMENT '完成时间（成功/失败/取消）';
ALTER TABLE t_agent_background_task MODIFY COLUMN timeout_seconds INT NOT NULL DEFAULT 1800 COMMENT '超时时间（秒），默认30分钟';
ALTER TABLE t_agent_background_task MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';
