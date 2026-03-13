-- AI调用度量记录表
-- IntelligenceObservabilityOrchestrator 在每次AI调用后写入，用于监控命中率/延迟/降级比例
CREATE TABLE IF NOT EXISTS `t_intelligence_metrics` (
    `id`             BIGINT        NOT NULL AUTO_INCREMENT,
    `tenant_id`      BIGINT        DEFAULT NULL,
    `scene`          VARCHAR(64)   DEFAULT NULL  COMMENT '调用场景(nl_query/predict/anomaly等)',
    `provider`       VARCHAR(64)   DEFAULT NULL  COMMENT 'AI提供商',
    `model`          VARCHAR(128)  DEFAULT NULL  COMMENT '模型名称',
    `success`        TINYINT(1)    DEFAULT NULL,
    `fallback_used`  TINYINT(1)    DEFAULT NULL,
    `latency_ms`     INT           DEFAULT NULL  COMMENT '调用耗时(毫秒)',
    `prompt_chars`   INT           DEFAULT NULL,
    `response_chars` INT           DEFAULT NULL,
    `error_message`  VARCHAR(512)  DEFAULT NULL,
    `user_id`        VARCHAR(64)   DEFAULT NULL,
    `create_time`    DATETIME      DEFAULT NULL,
    `delete_flag`    INT           DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `idx_tenant_scene`   (`tenant_id`, `scene`),
    KEY `idx_create_time`    (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI调用度量记录';
