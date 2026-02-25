-- ============================================================
-- V36: 第三方集成跟踪表（支付流水 / 物流运单 / 回调日志）
-- ============================================================

-- 支付流水表
CREATE TABLE IF NOT EXISTS t_payment_record (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id       BIGINT       NOT NULL                COMMENT '租户ID',
    order_id        VARCHAR(64)  NOT NULL                COMMENT '业务订单号',
    order_type      VARCHAR(32)  NOT NULL DEFAULT 'production' COMMENT '业务类型: production/sample/material',
    channel         VARCHAR(20)  NOT NULL                COMMENT '支付渠道: ALIPAY/WECHAT_PAY',
    amount          BIGINT       NOT NULL                COMMENT '应付金额（分）',
    actual_amount   BIGINT                               COMMENT '实付金额（分，支付成功后回填）',
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/SUCCESS/FAILED/REFUNDED/CANCELLED',
    third_party_order_id VARCHAR(128)                    COMMENT '第三方平台交易号',
    pay_url         VARCHAR(512)                         COMMENT '支付跳转链接',
    qr_code         VARCHAR(512)                         COMMENT '二维码内容',
    error_message   VARCHAR(512)                         COMMENT '失败原因',
    paid_time       DATETIME                             COMMENT '实际支付时间',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tenant_order (tenant_id, order_id),
    INDEX idx_third_party (third_party_order_id),
    INDEX idx_status (status),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='支付流水记录';

-- 物流运单表
CREATE TABLE IF NOT EXISTS t_logistics_record (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id       BIGINT       NOT NULL                COMMENT '租户ID',
    order_id        VARCHAR(64)  NOT NULL                COMMENT '业务订单号',
    company_code    VARCHAR(20)  NOT NULL                COMMENT '快递公司编码: SF/STO',
    company_name    VARCHAR(32)  NOT NULL                COMMENT '快递公司名称',
    tracking_number VARCHAR(64)                          COMMENT '运单号（下单成功后填入）',
    status          VARCHAR(20)  NOT NULL DEFAULT 'CREATED' COMMENT '状态: CREATED/IN_TRANSIT/ARRIVED/DELIVERED/CANCELLED/FAILED',
    sender_name     VARCHAR(64)                          COMMENT '寄件人姓名',
    sender_phone    VARCHAR(20)                          COMMENT '寄件人电话',
    sender_address  VARCHAR(256)                         COMMENT '寄件地址',
    receiver_name   VARCHAR(64)                          COMMENT '收件人姓名',
    receiver_phone  VARCHAR(20)                          COMMENT '收件人电话',
    receiver_address VARCHAR(256)                        COMMENT '收件地址',
    weight          DECIMAL(8,2)                         COMMENT '重量（kg）',
    estimated_fee   BIGINT                               COMMENT '预估运费（分）',
    actual_fee      BIGINT                               COMMENT '实际运费（分，结算后填入）',
    error_message   VARCHAR(512)                         COMMENT '失败原因',
    last_event      VARCHAR(256)                         COMMENT '最新物流事件描述',
    last_event_time DATETIME                             COMMENT '最新物流事件时间',
    delivered_time  DATETIME                             COMMENT '签收时间',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_tenant_order (tenant_id, order_id),
    INDEX idx_tracking (tracking_number),
    INDEX idx_status (status),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流运单记录';

-- 第三方回调日志表（存储所有原始 Webhook 报文，便于排查问题）
CREATE TABLE IF NOT EXISTS t_integration_callback_log (
    id              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    type            VARCHAR(20)  NOT NULL                COMMENT '类型: PAYMENT/LOGISTICS',
    channel         VARCHAR(20)  NOT NULL                COMMENT '渠道: ALIPAY/WECHAT_PAY/SF/STO',
    raw_body        MEDIUMTEXT                           COMMENT '原始回调报文',
    headers         TEXT                                 COMMENT '请求头（JSON格式，含签名字段）',
    verified        TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '签名验证是否通过: 0=否 1=是',
    processed       TINYINT(1)   NOT NULL DEFAULT 0      COMMENT '业务处理是否完成: 0=否 1=是',
    related_order_id VARCHAR(64)                         COMMENT '关联业务订单号（解析后填入）',
    error_message   VARCHAR(512)                         COMMENT '处理失败原因',
    created_time    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_type_channel (type, channel),
    INDEX idx_order (related_order_id),
    INDEX idx_verified (verified),
    INDEX idx_created (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='第三方回调日志';
