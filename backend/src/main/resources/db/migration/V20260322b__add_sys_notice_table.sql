-- V20260322: 新增站内通知表 t_sys_notice
-- 用途：供"通知跟单员"功能持久化站内消息，跟单员在 SmartAlertBell 收件箱查看
-- 匹配逻辑：to_name 存储 order.merchandiser 的原始字符串（可能是 name 或 username）

CREATE TABLE IF NOT EXISTS `t_sys_notice` (
    `id`          BIGINT       NOT NULL AUTO_INCREMENT             COMMENT '主键',
    `tenant_id`   BIGINT       NOT NULL                           COMMENT '租户ID',
    `to_name`     VARCHAR(64)  NOT NULL                           COMMENT '收件人（匹配 order.merchandiser，name 或 username 均可）',
    `from_name`   VARCHAR(64)  NOT NULL                           COMMENT '发送人姓名',
    `order_no`    VARCHAR(64)  NOT NULL                           COMMENT '关联订单号',
    `title`       VARCHAR(128) NOT NULL                           COMMENT '通知标题',
    `content`     VARCHAR(512) NOT NULL                           COMMENT '通知正文',
    `notice_type` VARCHAR(32)  NOT NULL DEFAULT 'stagnant'        COMMENT '类型：stagnant/deadline/quality/manual',
    `is_read`     TINYINT(1)   NOT NULL DEFAULT 0                 COMMENT '是否已读：0未读 1已读',
    `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
    PRIMARY KEY (`id`),
    INDEX `idx_notice_recipient` (`tenant_id`, `to_name`, `is_read`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='站内通知表';
