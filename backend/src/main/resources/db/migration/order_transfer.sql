-- 订单转移表
CREATE TABLE IF NOT EXISTS `order_transfer` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '转移ID',
  `order_id` bigint(20) NOT NULL COMMENT '订单ID',
  `from_user_id` bigint(20) NOT NULL COMMENT '发起人ID',
  `to_user_id` bigint(20) NOT NULL COMMENT '接收人ID',
  `status` varchar(20) NOT NULL DEFAULT 'pending' COMMENT '转移状态: pending-待处理, accepted-已接受, rejected-已拒绝',
  `message` varchar(500) DEFAULT NULL COMMENT '转移留言',
  `reject_reason` varchar(500) DEFAULT NULL COMMENT '拒绝原因',
  `created_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `handled_time` datetime DEFAULT NULL COMMENT '处理时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_from_user_id` (`from_user_id`),
  KEY `idx_to_user_id` (`to_user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_time` (`created_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='订单转移记录表';
