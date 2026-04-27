CREATE TABLE IF NOT EXISTS `t_supplier_user` (
  `id` VARCHAR(36) NOT NULL COMMENT '主键',
  `supplier_id` VARCHAR(36) NOT NULL COMMENT '关联供应商ID(t_factory.id)',
  `tenant_id` BIGINT NOT NULL COMMENT '所属租户ID',
  `username` VARCHAR(100) NOT NULL COMMENT '登录用户名',
  `password_hash` VARCHAR(255) NOT NULL COMMENT '加密后的密码',
  `contact_person` VARCHAR(100) DEFAULT NULL COMMENT '联系人姓名',
  `contact_phone` VARCHAR(50) DEFAULT NULL COMMENT '联系电话',
  `contact_email` VARCHAR(100) DEFAULT NULL COMMENT '联系邮箱',
  `status` VARCHAR(20) DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE/INACTIVE',
  `last_login_time` DATETIME DEFAULT NULL COMMENT '最后登录时间',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_flag` INT DEFAULT 0 COMMENT '软删除标志：0正常1已删除',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_su_username` (`username`),
  KEY `idx_su_supplier_id` (`supplier_id`),
  KEY `idx_su_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='供应商用户表';
