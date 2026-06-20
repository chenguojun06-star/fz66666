-- V202606201004: 创建 t_procedural_memory 表（L4 程序性记忆：SOP/流程/技能）
--
-- 背景：
--   五层记忆模型设计文档（.trae/rules/five-layer-memory-design.md）第四章。
--   显式存储人工编写的 SOP / 流程 / 技能，AI 直接调用而非推理。
--   解决"扫码流程怎么走""工资结算步骤"类流程问题回答不稳定。
--
-- 与 t_skill_template 的区别：
--   - SkillTemplate：AI 自动结晶化或人工，通用技能（metadata/skill_md/references 三层）
--   - ProceduralMemory：人工 SOP 为主 + 结晶化升级，业务 SOP（steps_json 结构化步骤）
--   - 检索：trigger_keywords 精确匹配 + 语义兜底
--
-- 多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在；
--   动态 SQL 内禁止字符串字面量 COMMENT，用独立 ALTER TABLE 回填注释

-- =============================================
-- 1. 创建 t_procedural_memory 表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_procedural_memory');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_procedural_memory (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        sop_name VARCHAR(128) NOT NULL,
        sop_type VARCHAR(32) NOT NULL,
        steps_json TEXT NOT NULL,
        preconditions TEXT NULL DEFAULT NULL,
        postcheck TEXT NULL DEFAULT NULL,
        trigger_keywords VARCHAR(512) NULL DEFAULT NULL,
        confidence DECIMAL(5,2) NOT NULL DEFAULT 0.80,
        usage_count INT NOT NULL DEFAULT 0,
        success_count INT NOT NULL DEFAULT 0,
        version INT NOT NULL DEFAULT 1,
        source VARCHAR(32) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_tenant_sop (tenant_id, sop_name),
        KEY idx_sop_type (tenant_id, sop_type),
        KEY idx_trigger (tenant_id, trigger_keywords(64))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

-- 回填表/列注释（D-004：动态 SQL 内禁止字符串字面量，用独立语句）
ALTER TABLE t_procedural_memory COMMENT 'L4程序性记忆：SOP/流程/技能（人工编写 + 结晶化升级）';
ALTER TABLE t_procedural_memory MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_procedural_memory MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_procedural_memory MODIFY COLUMN sop_name VARCHAR(128) NOT NULL COMMENT 'SOP名称（租户内唯一）';
ALTER TABLE t_procedural_memory MODIFY COLUMN sop_type VARCHAR(32) NOT NULL COMMENT 'SOP类型：SCAN_WORKFLOW/WAGE_SETTLEMENT/DELIVERY_FORECAST/SUPPLIER_EVAL/QUALITY_CHECK';
ALTER TABLE t_procedural_memory MODIFY COLUMN steps_json TEXT NOT NULL COMMENT '步骤数组JSON：[{step,action,tool,expected}]';
ALTER TABLE t_procedural_memory MODIFY COLUMN preconditions TEXT NULL DEFAULT NULL COMMENT '前置条件JSON';
ALTER TABLE t_procedural_memory MODIFY COLUMN postcheck TEXT NULL DEFAULT NULL COMMENT '后置校验JSON';
ALTER TABLE t_procedural_memory MODIFY COLUMN trigger_keywords VARCHAR(512) NULL DEFAULT NULL COMMENT '触发关键词，逗号分隔';
ALTER TABLE t_procedural_memory MODIFY COLUMN confidence DECIMAL(5,2) NOT NULL DEFAULT 0.80 COMMENT '置信度0-100';
ALTER TABLE t_procedural_memory MODIFY COLUMN usage_count INT NOT NULL DEFAULT 0 COMMENT '调用次数';
ALTER TABLE t_procedural_memory MODIFY COLUMN success_count INT NOT NULL DEFAULT 0 COMMENT '成功次数';
ALTER TABLE t_procedural_memory MODIFY COLUMN version INT NOT NULL DEFAULT 1 COMMENT '版本号（SOP过期时升级）';
ALTER TABLE t_procedural_memory MODIFY COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual' COMMENT '来源：manual/crystallized';
ALTER TABLE t_procedural_memory MODIFY COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0=禁用 1=启用';
ALTER TABLE t_procedural_memory MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';
