-- 集成渠道配置表：支持前端界面直接配置渠道密钥
CREATE TABLE IF NOT EXISTS t_integration_channel_config (
    id            BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id     BIGINT        NOT NULL COMMENT '租户ID',
    channel_code  VARCHAR(32)   NOT NULL COMMENT '渠道编码: ALIPAY/WECHAT_PAY/SF/STO',
    enabled       TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '是否启用 0=否 1=是',
    app_id        VARCHAR(128)  NULL COMMENT 'AppID / AppKey',
    app_secret    VARCHAR(512)  NULL COMMENT 'AppSecret / MchId',
    private_key   TEXT          NULL COMMENT '私钥 / API密钥',
    public_key    TEXT          NULL COMMENT '公钥',
    notify_url    VARCHAR(512)  NULL COMMENT '回调通知地址',
    extra_config  JSON          NULL COMMENT '扩展配置（JSON）',
    create_time   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    delete_flag   TINYINT(1)    NOT NULL DEFAULT 0,
    UNIQUE KEY uk_tenant_channel (tenant_id, channel_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='集成渠道配置';
