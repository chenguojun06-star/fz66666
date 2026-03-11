-- V45: 云端补丁 — 修复 mind-push 推送时段列缺失 + 确保智能指标表存在
-- 幂等写法，重复执行安全，用于修复 V41/V43 在云端未正确执行的情况
--
-- 背景：
--   V41 在 Flyway 链断裂期间可能未完整执行，导致云端 t_mind_push_rule 缺少
--   notify_time_start / notify_time_end 两列，每次调用 saveRule 均返回 HTTP 500。
--   本脚本作为显式安全补丁，保证列存在。

-- ① 确保 t_mind_push_rule 有 notify_time_start 列
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_mind_push_rule'
               AND COLUMN_NAME  = 'notify_time_start') = 0,
    'ALTER TABLE `t_mind_push_rule` ADD COLUMN `notify_time_start` VARCHAR(5) NOT NULL DEFAULT ''08:00'' COMMENT ''推送开始时间 HH:mm''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 确保 t_mind_push_rule 有 notify_time_end 列
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_mind_push_rule'
               AND COLUMN_NAME  = 'notify_time_end') = 0,
    'ALTER TABLE `t_mind_push_rule` ADD COLUMN `notify_time_end` VARCHAR(5) NOT NULL DEFAULT ''22:00'' COMMENT ''推送结束时间 HH:mm''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ③ 确保 t_intelligence_metrics 表存在（与 V43 内容一致，IF NOT EXISTS 幂等）
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
