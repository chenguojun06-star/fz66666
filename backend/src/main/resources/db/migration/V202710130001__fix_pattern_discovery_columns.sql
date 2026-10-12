-- ============================================================
-- V202710130001: 修复 t_pattern_discovery 结构漂移
--
-- 背景（2026-10-13 线上日志实证）：
--   定时任务 PatternDiscoveryOrchestrator 每轮都报
--     BadSqlGrammarException: Unknown column 'pattern_type' in 'field list'
--   因为生产库的 t_pattern_discovery 只有 6 列
--     (id, tenant_id, pattern_name, description, pattern_data, create_time)，
--   而实体 PatternDiscovery 需要 20 列。
--
--   为什么会漂移：仓库里的 V20260417001__create_autonomous_agent_tables.sql
--   用的是 `CREATE TABLE IF NOT EXISTS` —— 生产库在 2026-09-16 12:38 被一份
--   外部脚本/旧备份重建成了简化版，而该迁移早已被 Flyway 标记为 success，
--   于是 IF NOT EXISTS 什么都没做，漂移一直留着。
--
-- 影响：模式发现（AI 洞察）功能整体不可用，日志持续报错。
--
-- 写法：与 V38__add_scan_record_missing_columns.sql 同一套
--   information_schema 检查 + 动态 DDL，保证「列已存在的库（如全新库）」
--   重复执行不报错。
-- ============================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS add_column_if_not_exists$$

CREATE PROCEDURE add_column_if_not_exists(
    IN p_table VARCHAR(64),
    IN p_column VARCHAR(64),
    IN p_definition VARCHAR(500)
)
BEGIN
    DECLARE col_count INT;
    SELECT COUNT(*) INTO col_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column;

    IF col_count = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END$$

DELIMITER ;

-- pattern_type 与 pattern_name 在实体/原迁移里是 NOT NULL。
-- 给 DEFAULT '' 而不是裸 NOT NULL：万一某套环境已有历史行，加列时不会因严格模式失败。
CALL add_column_if_not_exists('t_pattern_discovery', 'pattern_type',
    "VARCHAR(50) NOT NULL DEFAULT '' COMMENT '模式类型: seasonal|correlation|anomaly_cluster|efficiency_trend|bottleneck_recurrence'");

CALL add_column_if_not_exists('t_pattern_discovery', 'evidence',
    "TEXT COMMENT '支撑证据(JSON: [{metric,value,timestamp}])'");

CALL add_column_if_not_exists('t_pattern_discovery', 'data_source',
    "VARCHAR(100) COMMENT '数据来源: scan_record|production_order|material_stock|finance'");

CALL add_column_if_not_exists('t_pattern_discovery', 'time_range_start',
    "DATETIME COMMENT '模式时间范围起'");

CALL add_column_if_not_exists('t_pattern_discovery', 'time_range_end',
    "DATETIME COMMENT '模式时间范围止'");

CALL add_column_if_not_exists('t_pattern_discovery', 'confidence',
    "INT DEFAULT 50 COMMENT '模式置信度0-100'");

CALL add_column_if_not_exists('t_pattern_discovery', 'impact_score',
    "INT DEFAULT 50 COMMENT '影响力评分0-100'");

CALL add_column_if_not_exists('t_pattern_discovery', 'recurrence_count',
    "INT DEFAULT 1 COMMENT '出现次数'");

CALL add_column_if_not_exists('t_pattern_discovery', 'last_seen',
    "DATETIME COMMENT '最近一次出现'");

CALL add_column_if_not_exists('t_pattern_discovery', 'suggested_action',
    "TEXT COMMENT 'AI建议的应对策略'");

CALL add_column_if_not_exists('t_pattern_discovery', 'is_actionable',
    "TINYINT DEFAULT 1 COMMENT '是否可执行'");

CALL add_column_if_not_exists('t_pattern_discovery', 'status',
    "VARCHAR(20) DEFAULT 'discovered' COMMENT 'discovered|confirmed|applied|dismissed'");

CALL add_column_if_not_exists('t_pattern_discovery', 'applied_result',
    "VARCHAR(500) COMMENT '应用后的效果'");

CALL add_column_if_not_exists('t_pattern_discovery', 'delete_flag',
    "INT DEFAULT 0");

CALL add_column_if_not_exists('t_pattern_discovery', 'update_time',
    "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

DROP PROCEDURE IF EXISTS add_column_if_not_exists;

-- 验证：应与实体字段一一对应（缺任何一列都会让 INSERT 报 Unknown column）
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_pattern_discovery'
ORDER BY ORDINAL_POSITION;
