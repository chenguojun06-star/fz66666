-- ============================================================
-- 选品模块数据库应急补丁（手动执行，幂等安全）
-- 问题：t_selection_candidate 等4张表在云端不存在，
--       导致 /api/style/info/list 全部 500
-- 执行位置：微信云托管控制台 → 数据库 → 执行SQL
-- 执行时间：2026-03-12
-- 用途说明：这是云端事故恢复脚本，不是常规迁移脚本。
-- 正常发布仍以 backend/src/main/resources/db/migration 下的 Flyway 脚本为准。
-- 仅在云端库结构异常、Flyway 未正确补齐时使用，避免后续误当成日常 SQL 重复执行。
-- ============================================================

-- ── STEP 1：创建选品批次表 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_selection_batch` (
    `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `batch_no`        VARCHAR(50)      NOT NULL                COMMENT '批次号 SEL-yyyyMMdd-xxxxx',
    `batch_name`      VARCHAR(200)     NOT NULL                COMMENT '批次名称',
    `season`          VARCHAR(20)      DEFAULT NULL            COMMENT '季节',
    `year`            INT              NOT NULL                COMMENT '年份',
    `theme`           VARCHAR(200)     DEFAULT NULL            COMMENT '主题/风格方向',
    `status`          VARCHAR(20)      NOT NULL DEFAULT 'DRAFT' COMMENT '状态: DRAFT/REVIEWING/APPROVED/CLOSED',
    `target_qty`      INT              DEFAULT 0,
    `finalized_qty`   INT              DEFAULT 0,
    `remark`          VARCHAR(500)     DEFAULT NULL,
    `created_by_id`   VARCHAR(64)      DEFAULT NULL,
    `created_by_name` VARCHAR(100)     DEFAULT NULL,
    `approved_by_id`  VARCHAR(64)      DEFAULT NULL,
    `approved_by_name` VARCHAR(100)    DEFAULT NULL,
    `approved_time`   DATETIME         DEFAULT NULL,
    `tenant_id`       BIGINT           NOT NULL,
    `delete_flag`     TINYINT(1)       NOT NULL DEFAULT 0,
    `create_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_batch_no_tenant` (`batch_no`, `tenant_id`),
    INDEX `idx_tenant_status` (`tenant_id`, `status`),
    INDEX `idx_tenant_year` (`tenant_id`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选品批次';

-- ── STEP 2：创建候选款资料池（核心，缺失此表导致 500）────────
CREATE TABLE IF NOT EXISTS `t_selection_candidate` (
    `id`                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `batch_id`            BIGINT UNSIGNED  NOT NULL                COMMENT '关联批次ID',
    `candidate_no`        VARCHAR(50)      NOT NULL                COMMENT '候选款编号',
    `style_name`          VARCHAR(200)     NOT NULL                COMMENT '款式名称',
    `category`            VARCHAR(100)     DEFAULT NULL            COMMENT '品类',
    `color_family`        VARCHAR(100)     DEFAULT NULL            COMMENT '主色系',
    `fabric_type`         VARCHAR(100)     DEFAULT NULL            COMMENT '面料类型',
    `source_type`         VARCHAR(30)      DEFAULT 'INTERNAL'      COMMENT '来源 INTERNAL/SUPPLIER/CLIENT',
    `source_desc`         VARCHAR(200)     DEFAULT NULL,
    `reference_images`    TEXT             DEFAULT NULL            COMMENT '参考图片URL（JSON数组）',
    `cost_estimate`       DECIMAL(10,2)    DEFAULT NULL,
    `target_price`        DECIMAL(10,2)    DEFAULT NULL,
    `target_qty`          INT              DEFAULT NULL,
    `status`              VARCHAR(20)      NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/APPROVED/REJECTED/HOLD',
    `trend_score`         INT              DEFAULT NULL,
    `trend_score_reason`  TEXT             DEFAULT NULL,
    `profit_estimate`     DECIMAL(5,2)     DEFAULT NULL,
    `season_tags`         VARCHAR(200)     DEFAULT NULL,
    `style_tags`          VARCHAR(300)     DEFAULT NULL,
    `avg_review_score`    DECIMAL(5,2)     DEFAULT NULL,
    `review_count`        INT              DEFAULT 0,
    `reject_reason`       VARCHAR(500)     DEFAULT NULL,
    `created_style_id`    BIGINT           DEFAULT NULL            COMMENT '审批通过后创建的StyleInfo ID',
    `created_style_no`    VARCHAR(50)      DEFAULT NULL,
    `remark`              VARCHAR(500)     DEFAULT NULL,
    `created_by_id`       VARCHAR(64)      DEFAULT NULL,
    `created_by_name`     VARCHAR(100)     DEFAULT NULL,
    `tenant_id`           BIGINT           NOT NULL,
    `delete_flag`         TINYINT(1)       NOT NULL DEFAULT 0,
    `create_time`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`         DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_candidate_no_tenant` (`candidate_no`, `tenant_id`),
    INDEX `idx_batch_status` (`batch_id`, `status`),
    INDEX `idx_tenant_status` (`tenant_id`, `status`),
    INDEX `idx_tenant_category` (`tenant_id`, `category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选品候选款资料池';

-- ── STEP 3：创建评审记录表 ─────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_selection_review` (
    `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `candidate_id`    BIGINT UNSIGNED  NOT NULL,
    `batch_id`        BIGINT UNSIGNED  NOT NULL,
    `reviewer_id`     VARCHAR(64)      NOT NULL,
    `reviewer_name`   VARCHAR(100)     NOT NULL,
    `score`           INT              DEFAULT NULL,
    `decision`        VARCHAR(20)      NOT NULL                COMMENT 'APPROVE/REJECT/HOLD',
    `comment`         VARCHAR(1000)    DEFAULT NULL,
    `dimensions`      TEXT             DEFAULT NULL            COMMENT '多维度评分JSON',
    `review_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `tenant_id`       BIGINT           NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_candidate_reviewer` (`candidate_id`, `reviewer_id`),
    INDEX `idx_batch_reviewer` (`batch_id`, `reviewer_id`),
    INDEX `idx_tenant_decision` (`tenant_id`, `decision`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选品评审记录';

-- ── STEP 4：创建趋势数据快照表 ────────────────────────────
CREATE TABLE IF NOT EXISTS `t_trend_snapshot` (
    `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `snapshot_date`   DATE             NOT NULL,
    `data_source`     VARCHAR(50)      NOT NULL                COMMENT 'INTERNAL/BAIDU/GOOGLE/WEIBO/MANUAL',
    `trend_type`      VARCHAR(50)      NOT NULL                COMMENT 'COLOR/SILHOUETTE/FABRIC/CATEGORY/KEYWORD',
    `keyword`         VARCHAR(200)     DEFAULT NULL,
    `heat_score`      INT              DEFAULT NULL,
    `trend_data`      TEXT             DEFAULT NULL,
    `keywords_json`   TEXT             DEFAULT NULL,
    `ai_summary`      TEXT             DEFAULT NULL,
    `ai_suggestion`   TEXT             DEFAULT NULL,
    `period`          VARCHAR(20)      DEFAULT NULL            COMMENT 'day/week/month',
    `tenant_id`       BIGINT           NOT NULL,
    `create_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_tenant_date_type` (`tenant_id`, `snapshot_date`, `trend_type`),
    INDEX `idx_keyword` (`keyword`),
    INDEX `idx_source_date` (`data_source`, `snapshot_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='趋势数据快照';

-- ── STEP 5：t_style_info 补充开发来源字段（幂等）─────────
SET @s1 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'development_source_type') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `development_source_type` VARCHAR(32) NULL COMMENT ''开发来源类型：SELF_DEVELOPED/SELECTION_CENTER'' AFTER `sample_review_time`',
    'SELECT 1'
);
PREPARE stmt FROM @s1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s2 = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_style_info'
       AND COLUMN_NAME = 'development_source_detail') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `development_source_detail` VARCHAR(64) NULL COMMENT ''开发来源明细：自主开发/外部市场/供应商/客户定制/内部选品'' AFTER `development_source_type`',
    'SELECT 1'
);
PREPARE stmt FROM @s2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── STEP 6：修复 Flyway 迁移历史（如有 FAILED 记录）────────
-- 手动建表后，把 Flyway 历史里的 FAILED 状态改为 SUCCESS，
-- 避免下次部署时 Flyway 报错拒绝启动
UPDATE `flyway_schema_history`
SET `success` = 1
WHERE `version` IN ('20260311010', '20260312003')
  AND `success` = 0;

-- ── 执行完毕：验证结果 ──────────────────────────────────────
SELECT TABLE_NAME, TABLE_COMMENT, CREATE_TIME
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('t_selection_batch','t_selection_candidate','t_selection_review','t_trend_snapshot')
ORDER BY TABLE_NAME;
