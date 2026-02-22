-- =============================================
-- 用户问题反馈表
-- 小程序和PC端双端提交，超管在客户管理页面查看
-- =============================================

CREATE TABLE IF NOT EXISTS `t_user_feedback` (
  `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
  `tenant_id`     BIGINT       NULL     COMMENT '租户ID',
  `user_id`       BIGINT       NULL     COMMENT '提交人ID',
  `user_name`     VARCHAR(100) NULL     COMMENT '提交人姓名',
  `tenant_name`   VARCHAR(200) NULL     COMMENT '租户名称（冗余，方便查询）',
  `source`        VARCHAR(20)  NOT NULL DEFAULT 'PC' COMMENT '来源：PC / MINIPROGRAM',
  `category`      VARCHAR(50)  NOT NULL DEFAULT 'BUG' COMMENT '分类：BUG / SUGGESTION / QUESTION / OTHER',
  `title`         VARCHAR(200) NOT NULL COMMENT '标题',
  `content`       TEXT         NOT NULL COMMENT '详细描述',
  `screenshot_urls` TEXT       NULL     COMMENT '截图URL（JSON数组）',
  `contact`       VARCHAR(100) NULL     COMMENT '联系方式（选填）',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING / PROCESSING / RESOLVED / CLOSED',
  `reply`         TEXT         NULL     COMMENT '管理员回复',
  `reply_time`    DATETIME     NULL     COMMENT '回复时间',
  `reply_user_id` BIGINT       NULL     COMMENT '回复人ID',
  `create_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_tenant_id` (`tenant_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户问题反馈';
