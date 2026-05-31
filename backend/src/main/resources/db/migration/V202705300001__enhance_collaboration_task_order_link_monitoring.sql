-- ============================================================
-- 协作任务订单联动增强 — 新增订单关联监控字段
-- 功能：
--   1. 款号关联 (style_no)
--   2. 订单关联状态 (order_link_status)
--   3. 订单进度监控 (progress_change_monitor_enabled)
--   4. 提醒记录 (last_reminder_sent_at, reminder_count)
--   5. 订单进度快照 (last_order_progress)
-- ============================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='style_no')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `style_no` VARCHAR(128)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='order_link_status')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `order_link_status` VARCHAR(32)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='progress_change_monitor_enabled')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `progress_change_monitor_enabled` TINYINT(1) DEFAULT 1',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='last_reminder_sent_at')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `last_reminder_sent_at` DATETIME',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='reminder_count')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `reminder_count` INT DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='last_order_progress')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `last_order_progress` INT',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND COLUMN_NAME='last_order_status')=0,
    'ALTER TABLE `t_collaboration_task` ADD COLUMN `last_order_status` VARCHAR(32)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_order_no')=0,
    'CREATE INDEX `idx_collab_order_no` ON `t_collaboration_task` (`order_no`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_collaboration_task' AND INDEX_NAME='idx_collab_style_no')=0,
    'CREATE INDEX `idx_collab_style_no` ON `t_collaboration_task` (`style_no`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 初始化现有数据
UPDATE `t_collaboration_task` SET `order_link_status` = 'NOT_LINKED' WHERE `order_link_status` IS NULL;
UPDATE `t_collaboration_task` SET `order_link_status` = 'LINKED' WHERE `order_no` IS NOT NULL AND `order_no` != 'general';
UPDATE `t_collaboration_task` SET `progress_change_monitor_enabled` = 1 WHERE `progress_change_monitor_enabled` IS NULL;
UPDATE `t_collaboration_task` SET `reminder_count` = 0 WHERE `reminder_count` IS NULL;

-- ============================================================
-- 任务提醒记录表：存储每一次提醒的详细信息
-- ============================================================

CREATE TABLE IF NOT EXISTS t_task_reminder_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    task_id BIGINT NOT NULL,
    reminder_type VARCHAR(32) NOT NULL,
    reminder_content TEXT,
    sent_to VARCHAR(128),
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_status VARCHAR(16) DEFAULT 'PENDING',
    error_message TEXT,
    INDEX idx_reminder_task_id (task_id),
    INDEX idx_reminder_tenant_id (tenant_id),
    INDEX idx_reminder_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
