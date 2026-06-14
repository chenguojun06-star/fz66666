-- ============================================================
-- V20260614001__create_intelligence_daily_briefing.sql
-- 每日智能简报表（幂等写法）
-- ============================================================

-- 创建表（如不存在）
CREATE TABLE IF NOT EXISTS `t_intelligence_daily_briefing` (
    `id`                        BIGINT          NOT NULL AUTO_INCREMENT,
    `tenant_id`                 BIGINT          NOT NULL,
    `briefing_date`             DATE            NOT NULL,
    `total_orders`              INT             DEFAULT 0,
    `pending_orders`            INT             DEFAULT 0,
    `at_risk_orders`            INT             DEFAULT 0,
    `total_production_progress` DOUBLE          DEFAULT 0.0,
    `delayed_style_count`       INT             DEFAULT 0,
    `low_stock_items`           INT             DEFAULT 0,
    `wage_pending_amount`       DECIMAL(12,2)   DEFAULT 0.00,
    `summary`                   TEXT            DEFAULT NULL,
    `generated_at`              DATETIME        DEFAULT NULL,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_tenant_date` (`tenant_id`, `briefing_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='每日智能简报';
