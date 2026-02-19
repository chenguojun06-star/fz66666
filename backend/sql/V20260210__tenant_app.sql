-- ============================================
-- 客户应用管理模块 - 建表SQL
-- 表: t_tenant_app, t_tenant_app_log
-- 日期: 2026-02-10
-- ============================================

-- 客户应用主表
CREATE TABLE IF NOT EXISTS `t_tenant_app` (
    `id` varchar(64) NOT NULL COMMENT '主键UUID',
    `tenant_id` bigint NOT NULL COMMENT '租户ID',
    `app_name` varchar(100) NOT NULL COMMENT '应用名称',
    `app_type` varchar(50) NOT NULL COMMENT '应用类型: ORDER_SYNC/QUALITY_FEEDBACK/LOGISTICS_SYNC/PAYMENT_SYNC',
    `app_key` varchar(64) NOT NULL COMMENT '应用密钥ID（对外暴露）',
    `app_secret` varchar(128) NOT NULL COMMENT '应用密钥（加密存储）',
    `status` varchar(20) NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    `callback_url` varchar(500) DEFAULT NULL COMMENT '客户回调URL（Webhook）',
    `callback_secret` varchar(64) DEFAULT NULL COMMENT '回调签名密钥',
    `external_api_url` varchar(500) DEFAULT NULL COMMENT '客户系统API地址',
    `config_json` text DEFAULT NULL COMMENT '对接配置JSON',
    `daily_quota` int DEFAULT 0 COMMENT '日调用上限（0=不限制）',
    `daily_used` int DEFAULT 0 COMMENT '今日已调用次数',
    `last_quota_reset_time` datetime DEFAULT NULL COMMENT '上次配额重置时间',
    `total_calls` bigint DEFAULT 0 COMMENT '总调用次数',
    `last_call_time` datetime DEFAULT NULL COMMENT '上次调用时间',
    `expire_time` datetime DEFAULT NULL COMMENT '过期时间（null=永不过期）',
    `remark` varchar(500) DEFAULT NULL COMMENT '备注',
    `created_by` varchar(64) DEFAULT NULL COMMENT '创建人',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag` tinyint DEFAULT 0 COMMENT '逻辑删除标记',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_key` (`app_key`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_type` (`app_type`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用管理';

-- 客户应用调用日志表
CREATE TABLE IF NOT EXISTS `t_tenant_app_log` (
    `id` varchar(64) NOT NULL COMMENT '主键UUID',
    `app_id` varchar(64) DEFAULT NULL COMMENT '应用ID',
    `tenant_id` bigint DEFAULT NULL COMMENT '租户ID',
    `app_type` varchar(50) DEFAULT NULL COMMENT '应用类型',
    `direction` varchar(20) DEFAULT NULL COMMENT '方向: INBOUND(客户→我们)/OUTBOUND(我们→客户)',
    `http_method` varchar(10) DEFAULT NULL COMMENT 'HTTP方法',
    `request_path` varchar(500) DEFAULT NULL COMMENT '请求路径',
    `request_body` text DEFAULT NULL COMMENT '请求体（截断存储）',
    `response_code` int DEFAULT NULL COMMENT 'HTTP响应码',
    `response_body` text DEFAULT NULL COMMENT '响应体（截断存储）',
    `cost_ms` bigint DEFAULT NULL COMMENT '耗时(毫秒)',
    `result` varchar(20) DEFAULT NULL COMMENT '结果: SUCCESS/FAILED/ERROR',
    `error_message` varchar(500) DEFAULT NULL COMMENT '错误信息',
    `client_ip` varchar(50) DEFAULT NULL COMMENT '客户端IP',
    `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    PRIMARY KEY (`id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_create_time` (`create_time`),
    KEY `idx_result` (`result`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用调用日志';
