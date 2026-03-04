-- V20260304: 创建电商平台凭证配置表
-- 存储每个租户对各电商平台（淘宝/京东/抖音等）的 AppKey/AppSecret 等凭证
-- 云端 FLYWAY_ENABLED=false，需在微信云托管控制台数据库面板手动执行此 SQL

CREATE TABLE IF NOT EXISTS t_ec_platform_config (
    id            BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id     BIGINT        NOT NULL                COMMENT '租户ID',
    platform_code VARCHAR(32)   NOT NULL                COMMENT '平台编码，如 TAOBAO/JD/DOUYIN',
    shop_name     VARCHAR(128)  DEFAULT NULL            COMMENT '店铺名称',
    app_key       VARCHAR(256)  DEFAULT NULL            COMMENT 'AppKey / Client ID / App ID',
    app_secret    VARCHAR(512)  DEFAULT NULL            COMMENT 'AppSecret / Client Secret（建议加密存储）',
    extra_field   VARCHAR(256)  DEFAULT NULL            COMMENT '扩展字段（如 Shopify 店铺域名）',
    status        VARCHAR(16)   NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE / DISABLED',
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_platform (tenant_id, platform_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='电商平台对接凭证配置';
