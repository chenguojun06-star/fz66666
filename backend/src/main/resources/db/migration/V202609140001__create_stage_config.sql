-- V202609140001: 创建 t_stage_config 表（生产环节配置：可操作人 + 预计时长 + 监控开关）
--
-- 背景：
--   环节配置系统（.trae/documents/环节配置实现方案.md）。
--   把生产流程硬编码的父环节（采购/裁剪/二次工艺/车缝/尾部/入库）变为可配置：
--   - 可操作人：配了→只有这些人可扫码；不配→所有人员可操作（拦截条件）
--   - 预计时长（天）：仅展示 + 超期预警，绝不参与交期/排产计算
--   - 监控开关：1=开启超期预警
--   - 大货与样衣共用同一套（按父环节名统一）
--   - 采购/入库为默认存在环节（default_stage=1），不展示工序列表但可配置
--
-- 多租户隔离（P0 铁律 4）：tenant_id=NULL=系统默认（全公司统一一套），
--   tenant_id=X=租户覆盖（与 t_process_parent_mapping 同构，本期 UI 不暴露覆盖）。
--
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在；
--   动态 SQL 内禁止字符串字面量 COMMENT，用独立 ALTER TABLE 回填注释；
--   种子数据用 INSERT IGNORE（uk_tenant_stage 唯一索引保证幂等）。

-- =============================================
-- 1. 创建 t_stage_config 表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_stage_config');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_stage_config (
        id             BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id      BIGINT NULL DEFAULT NULL,
        stage_name     VARCHAR(20) NOT NULL,
        expected_days  DECIMAL(8,2) NOT NULL DEFAULT 0,
        operators_json MEDIUMTEXT NULL DEFAULT NULL,
        monitor_switch TINYINT(1) NOT NULL DEFAULT 1,
        default_stage  TINYINT(1) NOT NULL DEFAULT 0,
        enabled        TINYINT(1) NOT NULL DEFAULT 1,
        delete_flag    TINYINT(1) NOT NULL DEFAULT 0,
        create_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tenant_stage (tenant_id, stage_name),
        KEY idx_stage_enabled (tenant_id, enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

-- 回填表/列注释（D-004：动态 SQL 内禁止字符串字面量，用独立语句）
ALTER TABLE t_stage_config COMMENT '生产环节配置（可操作人+预计时长，大货/样衣共用）';
ALTER TABLE t_stage_config MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_stage_config MODIFY COLUMN tenant_id BIGINT NULL DEFAULT NULL COMMENT '租户ID，NULL=系统默认（全公司统一一套）';
ALTER TABLE t_stage_config MODIFY COLUMN stage_name VARCHAR(20) NOT NULL COMMENT '父环节名：采购/裁剪/二次工艺/车缝/尾部/入库';
ALTER TABLE t_stage_config MODIFY COLUMN expected_days DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '预计时长（天），仅展示+超期预警，不参与交期计算';
ALTER TABLE t_stage_config MODIFY COLUMN operators_json MEDIUMTEXT NULL DEFAULT NULL COMMENT '可操作人JSON数组[{id,name}]，空=所有人员可操作（拦截条件）';
ALTER TABLE t_stage_config MODIFY COLUMN monitor_switch TINYINT(1) NOT NULL DEFAULT 1 COMMENT '超期监控开关：1=开启预警，0=关闭';
ALTER TABLE t_stage_config MODIFY COLUMN default_stage TINYINT(1) NOT NULL DEFAULT 0 COMMENT '默认存在环节(采购/入库)=1，不展示工序列表但可配置';
ALTER TABLE t_stage_config MODIFY COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0=禁用 1=启用';
ALTER TABLE t_stage_config MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';
ALTER TABLE t_stage_config MODIFY COLUMN create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间';
ALTER TABLE t_stage_config MODIFY COLUMN update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间';

-- =============================================
-- 2. 种子数据：6 个全局环节（tenant_id=NULL），INSERT IGNORE 保证幂等
-- =============================================
INSERT IGNORE INTO t_stage_config
    (tenant_id, stage_name, expected_days, operators_json, monitor_switch, default_stage, enabled, delete_flag)
VALUES
    (NULL, '采购',     0, NULL, 1, 1, 1, 0),
    (NULL, '裁剪',     0, NULL, 1, 0, 1, 0),
    (NULL, '二次工艺', 0, NULL, 1, 0, 1, 0),
    (NULL, '车缝',     0, NULL, 1, 0, 1, 0),
    (NULL, '尾部',     0, NULL, 1, 0, 1, 0),
    (NULL, '入库',     0, NULL, 1, 1, 1, 0);