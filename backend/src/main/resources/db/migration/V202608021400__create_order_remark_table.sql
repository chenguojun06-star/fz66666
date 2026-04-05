-- 通用备注表：按订单号(大货) 或 款号(样衣开发) 收集各节点人员的备注
CREATE TABLE IF NOT EXISTS `t_order_remark` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `target_type` VARCHAR(20) NOT NULL COMMENT 'order=大货订单, style=样衣开发',
  `target_no` VARCHAR(100) NOT NULL COMMENT '订单号或款号',
  `author_id` VARCHAR(64) DEFAULT NULL COMMENT '填写人ID',
  `author_name` VARCHAR(100) DEFAULT NULL COMMENT '填写人姓名',
  `author_role` VARCHAR(100) DEFAULT NULL COMMENT '填写人角色/工序节点',
  `content` TEXT NOT NULL COMMENT '备注内容',
  `tenant_id` BIGINT NOT NULL,
  `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delete_flag` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `idx_remark_target` (`tenant_id`, `target_type`, `target_no`),
  INDEX `idx_remark_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
