CREATE TABLE IF NOT EXISTS `t_intelligence_action_task_feedback` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT NOT NULL,
  `task_code` VARCHAR(100) NOT NULL,
  `related_order_no` VARCHAR(64) DEFAULT NULL,
  `feedback_status` VARCHAR(32) NOT NULL COMMENT 'PROCESSING/COMPLETED/REJECTED',
  `feedback_reason` VARCHAR(500) DEFAULT NULL,
  `completion_note` VARCHAR(500) DEFAULT NULL,
  `source_signal` VARCHAR(100) DEFAULT NULL,
  `next_review_at` VARCHAR(32) DEFAULT NULL,
  `operator_id` VARCHAR(64) DEFAULT NULL,
  `operator_name` VARCHAR(100) DEFAULT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `delete_flag` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_task` (`tenant_id`, `task_code`, `related_order_no`, `create_time`),
  KEY `idx_tenant_status` (`tenant_id`, `feedback_status`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='动作中心任务回执表';
