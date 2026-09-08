-- 大货订单操作日志表（与 t_style_operation_log 同构；含 tenant_id 多租户隔离）
CREATE TABLE IF NOT EXISTS `t_order_operation_log` (
  `id`          VARCHAR(36)  NOT NULL COMMENT '操作日志ID',
  `order_id`    BIGINT       DEFAULT NULL COMMENT '订单ID',
  `order_no`    VARCHAR(50)  DEFAULT NULL COMMENT '订单号',
  `action`      VARCHAR(64)  NOT NULL COMMENT '操作动作',
  `operator`    VARCHAR(50)  DEFAULT NULL COMMENT '操作人',
  `remark`      VARCHAR(512) DEFAULT NULL COMMENT '详情',
  `tenant_id`   BIGINT       DEFAULT NULL COMMENT '租户ID',
  `create_time` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  INDEX `idx_oo_order_no` (`order_no`),
  INDEX `idx_oo_order_id` (`order_id`),
  INDEX `idx_oo_tenant_time` (`tenant_id`, `create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='大货订单操作日志表';