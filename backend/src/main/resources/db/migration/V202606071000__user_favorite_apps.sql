-- 用户收藏应用表
CREATE TABLE IF NOT EXISTS `t_user_favorite_apps` (
  `id` varchar(36) NOT NULL,
  `tenant_id` bigint NOT NULL COMMENT '租户ID',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `favorite_data` text NOT NULL COMMENT '收藏数据JSON',
  `create_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_time` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `delete_flag` tinyint NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tenant_user` (`tenant_id`, `user_id`, `delete_flag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户收藏应用';
