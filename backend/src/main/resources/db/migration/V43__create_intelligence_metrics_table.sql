-- V43: 智能模块可观测指标表（AI调用记录持久化）
CREATE TABLE IF NOT EXISTS `t_intelligence_metrics` (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT,
  `tenant_id`       BIGINT       NOT NULL,
  `scene`           VARCHAR(100) NOT NULL COMMENT '调用场景（如 nl_query / predict / anomaly）',
  `provider`        VARCHAR(50)  DEFAULT NULL COMMENT 'AI提供商（deepseek / litellm / fallback）',
  `model`           VARCHAR(100) DEFAULT NULL COMMENT '模型名称',
  `success`         TINYINT(1)   NOT NULL DEFAULT 0,
  `fallback_used`   TINYINT(1)   NOT NULL DEFAULT 0,
  `latency_ms`      INT          DEFAULT NULL COMMENT '调用耗时（毫秒）',
  `prompt_chars`    INT          DEFAULT NULL COMMENT 'Prompt字符数',
  `response_chars`  INT          DEFAULT NULL COMMENT '响应字符数',
  `error_message`   VARCHAR(500) DEFAULT NULL,
  `user_id`         VARCHAR(64)  DEFAULT NULL,
  `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delete_flag`     TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_metrics_tenant_scene` (`tenant_id`, `scene`, `create_time`),
  INDEX `idx_metrics_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='智能模块AI调用度量表';
