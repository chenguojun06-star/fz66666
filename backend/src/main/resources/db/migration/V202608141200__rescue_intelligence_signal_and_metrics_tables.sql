-- =====================================================================
-- V202608141200 — 云端智能表紧急修复（t_intelligence_signal + t_intelligence_metrics）
-- 根因：V20260426001 使用 COMMENT ''xxx'' 导致 Flyway PREPARE 静默失败，
--       云端 flyway_schema_history 记录成功但实际列从未创建。
-- 修复策略：CREATE TABLE IF NOT EXISTS（整表不存在时创建）
--         + SET @s = IF() 幂等补列（表存在但列缺失时补齐）
-- ⚠️ 全部动态 SQL 不使用 COMMENT，避免转义引号静默截断
-- =====================================================================

-- ===== Part 1: t_intelligence_signal（统一智能信号表）=====
CREATE TABLE IF NOT EXISTS `t_intelligence_signal` (
    `id`              BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`       BIGINT       NOT NULL,
    `signal_type`     VARCHAR(50)  NOT NULL,
    `signal_code`     VARCHAR(100) NOT NULL,
    `signal_level`    VARCHAR(20)  NOT NULL DEFAULT 'info',
    `source_domain`   VARCHAR(50)  DEFAULT NULL,
    `source_id`       VARCHAR(100) DEFAULT NULL,
    `source_name`     VARCHAR(200) DEFAULT NULL,
    `signal_title`    VARCHAR(500) DEFAULT NULL,
    `signal_detail`   TEXT         DEFAULT NULL,
    `signal_analysis` TEXT         DEFAULT NULL,
    `related_ids`     VARCHAR(500) DEFAULT NULL,
    `priority_score`  INT          NOT NULL DEFAULT 50,
    `status`          VARCHAR(20)  NOT NULL DEFAULT 'open',
    `resolved_at`     DATETIME     DEFAULT NULL,
    `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`     INT          NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    INDEX `idx_signal_tenant_status` (`tenant_id`, `status`, `create_time`),
    INDEX `idx_signal_tenant_level`  (`tenant_id`, `signal_level`, `priority_score`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== Part 2: t_intelligence_metrics（AI调用度量表）=====
CREATE TABLE IF NOT EXISTS `t_intelligence_metrics` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT,
    `tenant_id`         BIGINT       DEFAULT NULL,
    `scene`             VARCHAR(64)  DEFAULT NULL,
    `provider`          VARCHAR(64)  DEFAULT NULL,
    `model`             VARCHAR(128) DEFAULT NULL,
    `trace_id`          VARCHAR(64)  DEFAULT NULL,
    `trace_url`         VARCHAR(500) DEFAULT NULL,
    `success`           TINYINT      DEFAULT NULL,
    `fallback_used`     TINYINT      DEFAULT NULL,
    `latency_ms`        INT          DEFAULT NULL,
    `prompt_chars`      INT          DEFAULT NULL,
    `response_chars`    INT          DEFAULT NULL,
    `tool_call_count`   INT          DEFAULT NULL,
    `prompt_tokens`     INT          DEFAULT NULL,
    `completion_tokens` INT          DEFAULT NULL,
    `error_message`     TEXT         DEFAULT NULL,
    `user_id`           VARCHAR(64)  DEFAULT NULL,
    `create_time`       DATETIME     DEFAULT NULL,
    `delete_flag`       INT          DEFAULT 0,
    PRIMARY KEY (`id`),
    INDEX `idx_metrics_tenant_scene` (`tenant_id`, `scene`),
    INDEX `idx_metrics_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== Part 3: 幂等补列（表已存在但列缺失的场景）=====
-- 针对 t_intelligence_metrics 的 5 个可能缺失列

-- 3.1 trace_id
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_metrics' AND COLUMN_NAME = 'trace_id') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `trace_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3.2 trace_url
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_metrics' AND COLUMN_NAME = 'trace_url') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `trace_url` VARCHAR(500) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3.3 tool_call_count
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_metrics' AND COLUMN_NAME = 'tool_call_count') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `tool_call_count` INT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3.4 prompt_tokens
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_metrics' AND COLUMN_NAME = 'prompt_tokens') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `prompt_tokens` INT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3.5 completion_tokens
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_metrics' AND COLUMN_NAME = 'completion_tokens') = 0,
    'ALTER TABLE `t_intelligence_metrics` ADD COLUMN `completion_tokens` INT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===== Part 4: 确保 error_message 为 TEXT（原始脚本用 VARCHAR(512)，Entity 映射为 TEXT）=====
SET @s = IF(
    (SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_intelligence_metrics' AND COLUMN_NAME = 'error_message') = 'varchar',
    'ALTER TABLE `t_intelligence_metrics` MODIFY COLUMN `error_message` TEXT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
