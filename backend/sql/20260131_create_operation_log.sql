-- 操作日志表
CREATE TABLE IF NOT EXISTS `t_operation_log` (
  `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  `module` VARCHAR(50) NOT NULL COMMENT '模块名称',
  `operation` VARCHAR(20) NOT NULL COMMENT '操作类型',
  `operator_id` BIGINT NOT NULL COMMENT '操作人ID',
  `operator_name` VARCHAR(50) NOT NULL COMMENT '操作人姓名',
  `target_type` VARCHAR(50) NOT NULL COMMENT '目标类型',
  `target_id` VARCHAR(100) NOT NULL COMMENT '目标ID',
  `target_name` VARCHAR(200) COMMENT '目标名称',
  `reason` VARCHAR(500) COMMENT '操作原因',
  `details` TEXT COMMENT '详细信息（JSON）',
  `ip` VARCHAR(50) COMMENT '操作IP',
  `user_agent` VARCHAR(500) COMMENT '浏览器信息',
  `operation_time` DATETIME NOT NULL COMMENT '操作时间',
  `status` VARCHAR(20) NOT NULL DEFAULT 'success' COMMENT '状态：success/failure',
  `error_message` TEXT COMMENT '错误信息',
  PRIMARY KEY (`id`),
  KEY `idx_module` (`module`),
  KEY `idx_operation` (`operation`),
  KEY `idx_operator` (`operator_id`, `operator_name`),
  KEY `idx_target` (`target_type`, `target_id`),
  KEY `idx_time` (`operation_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';
