-- ============================================================
-- V20260330001：保底创建选品模块四张核心表
-- 原始脚本 V20260311010 可能因部署时序问题未在云端执行
-- 本脚本版本号高于所有已执行脚本，确保 Flyway 会执行
-- 使用 CREATE TABLE IF NOT EXISTS，已存在则安全跳过
-- ============================================================

-- ── 1. 选品批次表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_selection_batch` (
    `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `batch_no`        VARCHAR(50)      NOT NULL                COMMENT '批次号 SEL-yyyyMMdd-xxxxx',
    `batch_name`      VARCHAR(200)     NOT NULL                COMMENT '批次名称（如 2026春夏主推款）',
    `season`          VARCHAR(20)      DEFAULT NULL            COMMENT '季节 spring/summer/autumn/winter',
    `year`            INT              NOT NULL                COMMENT '年份',
    `theme`           VARCHAR(200)     DEFAULT NULL            COMMENT '主题/风格方向',
    `status`          VARCHAR(20)      NOT NULL DEFAULT 'DRAFT'
                                                              COMMENT '状态: DRAFT草稿/REVIEWING评审中/APPROVED已确认/CLOSED已归档',
    `target_qty`      INT              DEFAULT 0               COMMENT '目标选款数量',
    `finalized_qty`   INT              DEFAULT 0               COMMENT '已确认款式数量',
    `remark`          VARCHAR(500)     DEFAULT NULL            COMMENT '备注',
    `created_by_id`   VARCHAR(64)      DEFAULT NULL            COMMENT '创建人ID',
    `created_by_name` VARCHAR(100)     DEFAULT NULL            COMMENT '创建人姓名',
    `approved_by_id`  VARCHAR(64)      DEFAULT NULL            COMMENT '审批人ID',
    `approved_by_name` VARCHAR(100)    DEFAULT NULL            COMMENT '审批人姓名',
    `approved_time`   DATETIME         DEFAULT NULL            COMMENT '审批时间',
    `tenant_id`       BIGINT           NOT NULL                COMMENT '租户ID',
    `delete_flag`     TINYINT(1)       NOT NULL DEFAULT 0      COMMENT '软删除标记',
    `create_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `update_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_batch_no_tenant` (`batch_no`, `tenant_id`),
    INDEX `idx_tenant_status` (`tenant_id`, `status`),
    INDEX `idx_tenant_year` (`tenant_id`, `year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选品批次';

-- ── 2. 候选款资料池 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_selection_candidate` (
    `id`                  BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `batch_id`            BIGINT UNSIGNED  NOT NULL                COMMENT '关联批次ID',
    `candidate_no`        VARCHAR(50)      NOT NULL                COMMENT '候选款编号 CAND-xxxxx',
    `style_name`          VARCHAR(200)     NOT NULL                COMMENT '款式名称',
    `category`            VARCHAR(100)     DEFAULT NULL            COMMENT '品类（上衣/裤子/裙子/外套等）',
    `color_family`        VARCHAR(100)     DEFAULT NULL            COMMENT '主色系描述',
    `fabric_type`         VARCHAR(100)     DEFAULT NULL            COMMENT '面料类型',
    `source_type`         VARCHAR(30)      DEFAULT 'INTERNAL'
                                                                  COMMENT '来源 INTERNAL自主/SUPPLIER供应商/CLIENT客户定制',
    `source_desc`         VARCHAR(200)     DEFAULT NULL            COMMENT '来源描述（供应商名/客户名）',
    `reference_images`    TEXT             DEFAULT NULL            COMMENT '参考图片URL列表（JSON数组）',
    `cost_estimate`       DECIMAL(10,2)    DEFAULT NULL            COMMENT '预估成本（元）',
    `target_price`        DECIMAL(10,2)    DEFAULT NULL            COMMENT '目标报价（元）',
    `target_qty`          INT              DEFAULT NULL            COMMENT '预计下单数量',
    `status`              VARCHAR(20)      NOT NULL DEFAULT 'PENDING'
                                                                  COMMENT '状态: PENDING待评审/APPROVED已通过/REJECTED已拒/HOLD待定',
    `trend_score`         INT              DEFAULT NULL            COMMENT 'AI趋势契合分(0-100)',
    `trend_score_reason`  TEXT             DEFAULT NULL            COMMENT 'AI打分依据',
    `profit_estimate`     DECIMAL(5,2)     DEFAULT NULL            COMMENT '预估利润率(%)',
    `season_tags`         VARCHAR(200)     DEFAULT NULL            COMMENT '适合季节标签（JSON）',
    `style_tags`          VARCHAR(300)     DEFAULT NULL            COMMENT '风格标签（JSON，如宽松/修身/休闲）',
    `avg_review_score`    DECIMAL(5,2)     DEFAULT NULL            COMMENT '平均评审分(0-100)',
    `review_count`        INT              DEFAULT 0               COMMENT '参与评审人数',
    `reject_reason`       VARCHAR(500)     DEFAULT NULL            COMMENT '拒绝原因',
    `created_style_id`    BIGINT           DEFAULT NULL            COMMENT '审批通过后创建的StyleInfo ID（关联t_style_info.id）',
    `created_style_no`    VARCHAR(50)      DEFAULT NULL            COMMENT '关联款号',
    `remark`              VARCHAR(500)     DEFAULT NULL            COMMENT '备注',
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

-- ── 3. 评审记录表 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_selection_review` (
    `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `candidate_id`    BIGINT UNSIGNED  NOT NULL                COMMENT '关联候选款ID',
    `batch_id`        BIGINT UNSIGNED  NOT NULL                COMMENT '关联批次ID（冗余，方便查询）',
    `reviewer_id`     VARCHAR(64)      NOT NULL                COMMENT '评审人ID',
    `reviewer_name`   VARCHAR(100)     NOT NULL                COMMENT '评审人姓名',
    `score`           INT              DEFAULT NULL            COMMENT '评分(0-100)',
    `decision`        VARCHAR(20)      NOT NULL                COMMENT '决策: APPROVE推荐/REJECT不推荐/HOLD待定',
    `comment`         VARCHAR(1000)    DEFAULT NULL            COMMENT '评审意见',
    `dimensions`      TEXT             DEFAULT NULL            COMMENT '多维度评分（JSON: 工艺/成本/趋势/客户需求）',
    `review_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '评审时间',
    `tenant_id`       BIGINT           NOT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_candidate_reviewer` (`candidate_id`, `reviewer_id`) COMMENT '每人每款只能评审一次',
    INDEX `idx_batch_reviewer` (`batch_id`, `reviewer_id`),
    INDEX `idx_tenant_decision` (`tenant_id`, `decision`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='选品评审记录';

-- ── 4. 趋势数据快照表 ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_trend_snapshot` (
    `id`              BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '主键',
    `snapshot_date`   DATE             NOT NULL                COMMENT '快照日期',
    `data_source`     VARCHAR(50)      NOT NULL                COMMENT '数据来源: INTERNAL内部/BAIDU百度指数/GOOGLE/WEIBO微博/MANUAL手动录入',
    `trend_type`      VARCHAR(50)      NOT NULL                COMMENT '趋势类型: COLOR颜色/SILHOUETTE廓形/FABRIC面料/CATEGORY品类/KEYWORD关键词',
    `keyword`         VARCHAR(200)     DEFAULT NULL            COMMENT '趋势关键词',
    `heat_score`      INT              DEFAULT NULL            COMMENT '热度分(0-100)',
    `trend_data`      TEXT             DEFAULT NULL            COMMENT '原始趋势数据（JSON）',
    `keywords_json`   TEXT             DEFAULT NULL            COMMENT '关联关键词列表（JSON）',
    `ai_summary`      TEXT             DEFAULT NULL            COMMENT 'AI生成的中文趋势摘要',
    `ai_suggestion`   TEXT             DEFAULT NULL            COMMENT 'AI给出的选品建议',
    `period`          VARCHAR(20)      DEFAULT NULL            COMMENT '时间周期: day/week/month',
    `tenant_id`       BIGINT           NOT NULL,
    `create_time`     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_tenant_date_type` (`tenant_id`, `snapshot_date`, `trend_type`),
    INDEX `idx_keyword` (`keyword`),
    INDEX `idx_source_date` (`data_source`, `snapshot_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='趋势数据快照';
