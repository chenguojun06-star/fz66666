CREATE TABLE IF NOT EXISTS `t_urge_record` (
  `id` VARCHAR(64) NOT NULL COMMENT '主键',
  `tenant_id` BIGINT NOT NULL COMMENT '租户ID',
  `order_id` VARCHAR(64) NOT NULL COMMENT '生产订单ID',
  `order_no` VARCHAR(64) NOT NULL COMMENT '订单号',
  `sender_name` VARCHAR(100) DEFAULT NULL COMMENT '催单人姓名',
  `receiver_name` VARCHAR(100) DEFAULT NULL COMMENT '被催人(跟单员)姓名',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '催单备注',
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT '状态: pending-待回复, replied-已回复, ignored-已忽略',
  `reply_content` VARCHAR(500) DEFAULT NULL COMMENT '回复内容',
  `reply_expected_ship_date` DATETIME DEFAULT NULL COMMENT '回复的预计出货日期',
  `reply_time` DATETIME DEFAULT NULL COMMENT '回复时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '催单时间',
  PRIMARY KEY (`id`),
  KEY `idx_urge_order_id` (`order_id`),
  KEY `idx_urge_tenant_order` (`tenant_id`, `order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='催单记录表';

-- MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS，使用 INFORMATION_SCHEMA 守卫
SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='urge_count');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN urge_count INT NOT NULL DEFAULT 0 COMMENT ''催单次数''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='last_urge_time');
SET @s = IF(@col=0, 'ALTER TABLE t_production_order ADD COLUMN last_urge_time DATETIME DEFAULT NULL COMMENT ''最后催单时间''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='urge_record_id');
SET @s = IF(@col=0, 'ALTER TABLE t_sys_notice ADD COLUMN urge_record_id VARCHAR(64) DEFAULT NULL COMMENT ''关联催单记录ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sys_notice' AND COLUMN_NAME='action_type');
SET @s = IF(@col=0, 'ALTER TABLE t_sys_notice ADD COLUMN action_type VARCHAR(32) DEFAULT NULL COMMENT ''操作类型: urge_order等''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;