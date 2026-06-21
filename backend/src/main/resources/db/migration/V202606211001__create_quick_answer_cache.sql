-- V202606211001: 创建 t_quick_answer 秒答缓存表（Business Snapshot + Prebuilt Answer）
--
-- 背景：
--   用户反馈"发信息过去要一两分钟才回答"。核心问题是每次提问都需要临时查询、
--   分析、生成回答。解决方案是把高频问题的答案和业务数据提前预取好。
--
-- 三层秒答体系：
--   1. Business Snapshot (type='SNAPSHOT')：每30分钟的业务数据快照（数字卡片）
--   2. Prebuilt Answer (type='PREBUILT')：高频问题的完整回答（可直接引用）
--   3. Hotspot Prefetch (type='HOTSPOT')：用户正在查看的页面预取
--
-- 多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE
-- 幂等写法（P0 铁律 1 / D-004）：information_schema 检查表是否存在

-- =============================================
-- 1. 创建 t_quick_answer 表
-- =============================================
SET @t_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_quick_answer');
SET @s_create = IF(@t_exists=0,
    'CREATE TABLE t_quick_answer (
        id BIGINT NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT NOT NULL,
        answer_type VARCHAR(16) NOT NULL,
        question_pattern VARCHAR(512) NULL,
        answer_summary TEXT NULL,
        snapshot_data MEDIUMTEXT NULL,
        raw_evidence MEDIUMTEXT NULL,
        confidence DECIMAL(5,2) NOT NULL DEFAULT 0.90,
        data_timestamp DATETIME NOT NULL,
        cache_source VARCHAR(64) NULL,
        hit_count INT NOT NULL DEFAULT 0,
        last_hit_time DATETIME NULL,
        delete_flag TINYINT NOT NULL DEFAULT 0,
        create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        expire_time DATETIME NOT NULL,
        PRIMARY KEY (id),
        KEY idx_tenant_type (tenant_id, answer_type, delete_flag),
        KEY idx_tenant_question (tenant_id, question_pattern(128), delete_flag),
        KEY idx_expire (expire_time),
        KEY idx_data_timestamp (tenant_id, data_timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'SELECT 1');
PREPARE stmt_create FROM @s_create; EXECUTE stmt_create; DEALLOCATE PREPARE stmt_create;

-- 回填表/列注释（D-004）
ALTER TABLE t_quick_answer COMMENT 'AI秒答缓存-业务快照与预构建答案';
ALTER TABLE t_quick_answer MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID';
ALTER TABLE t_quick_answer MODIFY COLUMN tenant_id BIGINT NOT NULL COMMENT '租户ID（P0铁律4：多租户隔离）';
ALTER TABLE t_quick_answer MODIFY COLUMN answer_type VARCHAR(16) NOT NULL COMMENT '缓存类型：SNAPSHOT(业务快照)/PREBUILT(预构建答案)/HOTSPOT(热点预取)';
ALTER TABLE t_quick_answer MODIFY COLUMN question_pattern VARCHAR(512) NULL COMMENT '匹配的问题模式（用于PREBUILT类型的命中判断）';
ALTER TABLE t_quick_answer MODIFY COLUMN answer_summary TEXT NULL COMMENT '答案摘要（可直接显示给用户的文本）';
ALTER TABLE t_quick_answer MODIFY COLUMN snapshot_data MEDIUMTEXT NULL COMMENT '结构化快照数据JSON（订单数/物料/质检等）';
ALTER TABLE t_quick_answer MODIFY COLUMN raw_evidence MEDIUMTEXT NULL COMMENT '证据/查询来源记录JSON（供DataTruthGuard验证）';
ALTER TABLE t_quick_answer MODIFY COLUMN confidence DECIMAL(5,2) NOT NULL DEFAULT 0.90 COMMENT '置信度0-100';
ALTER TABLE t_quick_answer MODIFY COLUMN data_timestamp DATETIME NOT NULL COMMENT '数据时间戳（表示此答案反映的时间点）';
ALTER TABLE t_quick_answer MODIFY COLUMN cache_source VARCHAR(64) NULL COMMENT '来源：BusinessSnapshotPrefetcher/ProactivePatrolAgent等';
ALTER TABLE t_quick_answer MODIFY COLUMN hit_count INT NOT NULL DEFAULT 0 COMMENT '命中次数（帮助判断哪些问题是高频）';
ALTER TABLE t_quick_answer MODIFY COLUMN last_hit_time DATETIME NULL COMMENT '最后命中时间';
ALTER TABLE t_quick_answer MODIFY COLUMN delete_flag TINYINT NOT NULL DEFAULT 0 COMMENT '删除标记0=有效1=已删除';
ALTER TABLE t_quick_answer MODIFY COLUMN expire_time DATETIME NOT NULL COMMENT '过期时间（默认为30分钟后，与预取周期对齐）';
