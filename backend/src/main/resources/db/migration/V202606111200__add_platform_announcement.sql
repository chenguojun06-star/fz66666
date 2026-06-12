-- 平台公告表：管理员发布，所有租户可见，用户关闭后不再显示
CREATE TABLE IF NOT EXISTS `t_platform_announcement` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(128) NOT NULL COMMENT '公告标题',
  `content` TEXT DEFAULT NULL COMMENT '公告正文',
  `type` VARCHAR(32) NOT NULL DEFAULT 'info' COMMENT '类型: info/warning/important',
  `active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否生效: 0下架 1生效',
  `start_time` DATETIME DEFAULT NULL COMMENT '生效时间(为空则立即生效)',
  `end_time` DATETIME DEFAULT NULL COMMENT '失效时间(为空则永久生效)',
  `created_by` VARCHAR(64) DEFAULT NULL COMMENT '发布人',
  `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID(为空则所有租户可见)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_active_time` (`active`, `start_time`, `end_time`),
  KEY `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='平台公告';

-- 用户已读记录表：用户关闭横幅后记录，避免重复显示
CREATE TABLE IF NOT EXISTS `t_announcement_read` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `announcement_id` BIGINT NOT NULL COMMENT '公告ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '用户ID',
  `tenant_id` BIGINT DEFAULT NULL COMMENT '租户ID',
  `read_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_announcement_user` (`announcement_id`, `user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告已读记录';
