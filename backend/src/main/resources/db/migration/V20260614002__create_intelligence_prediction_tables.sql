-- ============================================================
-- V20260614002__create_intelligence_prediction_tables.sql
-- 交期风险预测表 + 库存补货建议表（幂等写法）
-- ============================================================

-- 交期风险预测表
CREATE TABLE IF NOT EXISTS `t_intelligence_delivery_risk` (
    `id`                          BIGINT        NOT NULL AUTO_INCREMENT,
    `tenant_id`                   BIGINT        NOT NULL,
    `order_id`                    BIGINT        DEFAULT NULL,
    `order_no`                    VARCHAR(64)   DEFAULT NULL,
    `style_name`                  VARCHAR(128)  DEFAULT NULL,
    `customer_name`               VARCHAR(128)  DEFAULT NULL,
    `delivery_date`               DATE          DEFAULT NULL,
    `predicted_completion_date`   DATE          DEFAULT NULL,
    `risk_level`                  VARCHAR(16)   DEFAULT 'LOW',
    `risk_score`                  INT           DEFAULT 0,
    `delay_days`                  INT           DEFAULT 0,
    `reason`                      VARCHAR(512)  DEFAULT NULL,
    `current_progress`            DOUBLE        DEFAULT 0.0,
    `created_at`                  DATETIME      DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_risk` (`tenant_id`, `risk_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='交期风险预测';

-- 库存补货建议表
CREATE TABLE IF NOT EXISTS `t_intelligence_restock_suggestion` (
    `id`                    BIGINT          NOT NULL AUTO_INCREMENT,
    `tenant_id`             BIGINT          NOT NULL,
    `material_id`           BIGINT          DEFAULT NULL,
    `material_name`         VARCHAR(128)    DEFAULT NULL,
    `material_code`         VARCHAR(64)     DEFAULT NULL,
    `current_stock`         DOUBLE          DEFAULT 0.0,
    `safety_stock`          DOUBLE          DEFAULT 0.0,
    `avg_daily_usage`       DOUBLE          DEFAULT 0.0,
    `days_until_shortage`   INT             DEFAULT 0,
    `suggested_quantity`    DOUBLE          DEFAULT 0.0,
    `priority`              VARCHAR(16)     DEFAULT 'LOW',
    `reason`                VARCHAR(512)    DEFAULT NULL,
    `created_at`            DATETIME        DEFAULT NULL,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_priority` (`tenant_id`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='库存补货建议';
