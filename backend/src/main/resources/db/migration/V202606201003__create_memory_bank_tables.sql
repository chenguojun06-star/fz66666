-- V202606201003: 创建 Memory Bank 数据库表（ConPort 模式）
--
-- 背景：
--   借鉴 RooFlow Context Portal (ConPort) 2026-02-19 升级，
--   将 memory-bank/*.md 纯 Markdown 文件数据库化，支持：
--     1. 语义检索替代通读（title + content + tags 全文搜索，未来接 Qdrant 向量搜索）
--     2. decisions ↔ progress ↔ architecture 显式关系（知识图谱）
--     3. 多工作区支持（workspace_id = tenant_id，多租户隔离 P0 铁律）
--
-- 表1：t_memory_bank_entry — 记忆条目（替代 Markdown 文件）
--   category: product_context/active_context/system_patterns/decision_log/progress
--   entry_key: 条目唯一 key（如 D-020 / INC-20260611-001 / 2026-06-19变更）
--
-- 表2：t_memory_bank_relation — 知识图谱关系
--   relation_type: IMPACTS/DEPENDS_ON/EVOLVES_FROM/REFERENCES
--
-- 幂等写法：使用 information_schema 检查表是否存在（参考 V202606201002 模式）
-- 注意：动态 SQL 内禁止字符串字面量 COMMENT（D-004 铁律），用独立 ALTER TABLE 回填注释

-- =============================================
-- 1. 创建 t_memory_bank_entry 表
-- =============================================
SET @t1_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_memory_bank_entry');
SET @s_create_entry = IF(@t1_exists=0,
    'CREATE TABLE t_memory_bank_entry (
        id VARCHAR(32) NOT NULL,
        tenant_id BIGINT NOT NULL,
        category VARCHAR(50) NOT NULL,
        entry_key VARCHAR(200) NOT NULL,
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL,
        content_vector JSON NULL DEFAULT NULL,
        tags JSON NULL DEFAULT NULL,
        metadata JSON NULL DEFAULT NULL,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        delete_flag TINYINT(1) NOT NULL DEFAULT 0,
        PRIMARY KEY (id),
        INDEX idx_tenant_category (tenant_id, category, delete_flag),
        INDEX idx_tenant_key (tenant_id, entry_key),
        UNIQUE KEY uk_tenant_category_key (tenant_id, category, entry_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create_entry FROM @s_create_entry; EXECUTE stmt_create_entry; DEALLOCATE PREPARE stmt_create_entry;

-- 回填表注释（D-004：动态 SQL 内禁止字符串字面量，用独立语句）
ALTER TABLE t_memory_bank_entry COMMENT 'Memory Bank 记忆条目表（ConPort 模式，替代 Markdown 文件）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN id VARCHAR(32) NOT NULL COMMENT '主键ID（UUID去横线前32位）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（多租户隔离，0=公共记忆）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN category VARCHAR(50) NOT NULL COMMENT '分类：product_context/active_context/system_patterns/decision_log/progress';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN entry_key VARCHAR(200) NOT NULL COMMENT '条目key（如 D-020 / INC-20260611-001）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN title VARCHAR(500) NOT NULL COMMENT '条目标题';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN content TEXT NOT NULL COMMENT '正文内容（Markdown）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN content_vector JSON NULL DEFAULT NULL COMMENT '向量嵌入（未来接 Qdrant，当前为空）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN tags JSON NULL DEFAULT NULL COMMENT '标签数组（JSON）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN metadata JSON NULL DEFAULT NULL COMMENT '元数据（priority/status/related_keys 等）';
ALTER TABLE t_memory_bank_entry MODIFY COLUMN delete_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除：0=正常 1=已删除';

-- =============================================
-- 2. 创建 t_memory_bank_relation 表
-- =============================================
SET @t2_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_memory_bank_relation');
SET @s_create_rel = IF(@t2_exists=0,
    'CREATE TABLE t_memory_bank_relation (
        id VARCHAR(32) NOT NULL,
        tenant_id BIGINT NOT NULL,
        source_entry_id VARCHAR(32) NOT NULL,
        target_entry_id VARCHAR(32) NOT NULL,
        relation_type VARCHAR(50) NOT NULL,
        weight DECIMAL(3,2) NOT NULL DEFAULT 1.00,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_tenant_source (tenant_id, source_entry_id),
        INDEX idx_tenant_target (tenant_id, target_entry_id),
        INDEX idx_tenant_type (tenant_id, relation_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create_rel FROM @s_create_rel; EXECUTE stmt_create_rel; DEALLOCATE PREPARE stmt_create_rel;

-- 回填表注释
ALTER TABLE t_memory_bank_relation COMMENT 'Memory Bank 知识图谱关系表（ConPort 模式）';
ALTER TABLE t_memory_bank_relation MODIFY COLUMN id VARCHAR(32) NOT NULL COMMENT '主键ID（UUID去横线前32位）';
ALTER TABLE t_memory_bank_relation MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（多租户隔离）';
ALTER TABLE t_memory_bank_relation MODIFY COLUMN source_entry_id VARCHAR(32) NOT NULL COMMENT '源条目ID（t_memory_bank_entry.id）';
ALTER TABLE t_memory_bank_relation MODIFY COLUMN target_entry_id VARCHAR(32) NOT NULL COMMENT '目标条目ID（t_memory_bank_entry.id）';
ALTER TABLE t_memory_bank_relation MODIFY COLUMN relation_type VARCHAR(50) NOT NULL COMMENT '关系类型：IMPACTS/DEPENDS_ON/EVOLVES_FROM/REFERENCES';
ALTER TABLE t_memory_bank_relation MODIFY COLUMN weight DECIMAL(3,2) NOT NULL DEFAULT 1.00 COMMENT '关系权重（0.00-9.99）';
