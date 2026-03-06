-- MindPush 主动推送中枢 & OrderTrack 客户进度门户 建表脚本
-- V39 | 2026-03-xx

-- ① 推送规则配置（每租户可独立开关每种事件）
CREATE TABLE IF NOT EXISTS t_mind_push_rule (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id     BIGINT       NOT NULL,
    rule_code     VARCHAR(64)  NOT NULL,   -- DELIVERY_RISK / STAGNANT / MATERIAL_LOW / PAYROLL_READY
    rule_name     VARCHAR(128) NOT NULL,
    enabled       TINYINT      NOT NULL DEFAULT 1,
    threshold_days     INT     DEFAULT 3,  -- 触发天数阈值
    threshold_progress INT     DEFAULT 60, -- 触发进度阈值（%）
    created_at    DATETIME     DEFAULT NOW(),
    updated_at    DATETIME     DEFAULT NOW() ON UPDATE NOW(),
    UNIQUE KEY uk_tenant_rule (tenant_id, rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MindPush 推送规则配置';

-- ② 推送日志（每次触发推送写一条记录）
CREATE TABLE IF NOT EXISTS t_mind_push_log (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id     BIGINT       NOT NULL,
    rule_code     VARCHAR(64)  NOT NULL,
    order_id      VARCHAR(64),
    order_no      VARCHAR(128),
    title         VARCHAR(256),
    content       TEXT,
    channel       VARCHAR(32)  NOT NULL DEFAULT 'IN_APP',  -- IN_APP / WECHAT(future)
    pushed_at     DATETIME     DEFAULT NOW(),
    INDEX idx_tenant_pushed (tenant_id, pushed_at),
    INDEX idx_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='MindPush 推送日志';

-- ③ 订单分享 Token（客户进度门户）
CREATE TABLE IF NOT EXISTS t_order_share_token (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id     BIGINT       NOT NULL,
    order_id      VARCHAR(64)  NOT NULL,
    order_no      VARCHAR(128),
    token         VARCHAR(64)  NOT NULL UNIQUE,
    expire_days   INT          NOT NULL DEFAULT 30,
    expires_at    DATETIME     NOT NULL,
    access_count  INT          NOT NULL DEFAULT 0,
    created_by    VARCHAR(64),
    created_at    DATETIME     DEFAULT NOW(),
    INDEX idx_token (token),
    INDEX idx_order (tenant_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单分享 Token';
