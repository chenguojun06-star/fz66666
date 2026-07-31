-- V202608081300: 创建 APS 高级排产约束求解引擎所需的工序级产能表
--
-- 背景：
--   替换空壳 OptimizationSolverOrchestrator，落地真实约束求解引擎。
--   需要工序级产能配置（t_process_capacity）和工厂工作日历（t_factory_calendar）。
--
-- 多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在；
--   动态 SQL 内禁止字符串字面量 COMMENT，用独立 ALTER TABLE 回填注释
-- 类型对齐（P0）：factory_id 使用 VARCHAR(64)，与 t_factory.id（UUID）保持一致，
--   遵循 FactoryWorker/SecondaryProcess/MaterialPickupRecord 等既有表约定

-- =============================================
-- 1. 创建 t_process_capacity 表（工序级产能配置）
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_process_capacity');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_process_capacity (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        factory_id VARCHAR(64) NOT NULL,
        factory_name VARCHAR(128) NULL DEFAULT NULL,
        process_name VARCHAR(64) NOT NULL,
        daily_capacity INT NOT NULL DEFAULT 0,
        unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tenant_factory_process (tenant_id, factory_id, process_name),
        KEY idx_factory (tenant_id, factory_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

-- 回填表/列注释（D-004：动态 SQL 内禁止字符串字面量，用独立语句）
ALTER TABLE t_process_capacity COMMENT '工序级产能配置（APS排产引擎）';
ALTER TABLE t_process_capacity MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_process_capacity MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_process_capacity MODIFY COLUMN factory_id VARCHAR(64) NOT NULL COMMENT '工厂ID（关联t_factory.id，UUID）';
ALTER TABLE t_process_capacity MODIFY COLUMN factory_name VARCHAR(128) NULL DEFAULT NULL COMMENT '工厂名称（冗余）';
ALTER TABLE t_process_capacity MODIFY COLUMN process_name VARCHAR(64) NOT NULL COMMENT '工序名称（裁剪/车缝/尾部等）';
ALTER TABLE t_process_capacity MODIFY COLUMN daily_capacity INT NOT NULL DEFAULT 0 COMMENT '日产能（件/天）';
ALTER TABLE t_process_capacity MODIFY COLUMN unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '单位工序成本（元/件）';
ALTER TABLE t_process_capacity MODIFY COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0=禁用 1=启用';
ALTER TABLE t_process_capacity MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';
ALTER TABLE t_process_capacity MODIFY COLUMN create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE t_process_capacity MODIFY COLUMN update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- =============================================
-- 2. 创建 t_factory_calendar 表（工厂工作日历）
-- =============================================
SET @t_exists2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory_calendar');
SET @s_create2 = IF(@t_exists2=0,
    'CREATE TABLE t_factory_calendar (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        factory_id VARCHAR(64) NOT NULL,
        calendar_date DATE NOT NULL,
        is_workday TINYINT(1) NOT NULL DEFAULT 1,
        shift_hours INT NOT NULL DEFAULT 8,
        note VARCHAR(128) NULL DEFAULT NULL,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tenant_factory_date (tenant_id, factory_id, calendar_date),
        KEY idx_date (tenant_id, calendar_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create2 FROM @s_create2; EXECUTE stmt_create2; DEALLOCATE PREPARE stmt_create2;

-- 回填表/列注释
ALTER TABLE t_factory_calendar COMMENT '工厂工作日历（APS排产引擎）';
ALTER TABLE t_factory_calendar MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_factory_calendar MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_factory_calendar MODIFY COLUMN factory_id VARCHAR(64) NOT NULL COMMENT '工厂ID（关联t_factory.id，UUID）';
ALTER TABLE t_factory_calendar MODIFY COLUMN calendar_date DATE NOT NULL COMMENT '日历日期';
ALTER TABLE t_factory_calendar MODIFY COLUMN is_workday TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=工作日 0=休息日';
ALTER TABLE t_factory_calendar MODIFY COLUMN shift_hours INT NOT NULL DEFAULT 8 COMMENT '班次小时数';
ALTER TABLE t_factory_calendar MODIFY COLUMN note VARCHAR(128) NULL DEFAULT NULL COMMENT '备注（如：春节放假）';
ALTER TABLE t_factory_calendar MODIFY COLUMN create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE t_factory_calendar MODIFY COLUMN update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';
