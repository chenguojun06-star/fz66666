ALTER TABLE `t_cutting_bundle`
    ADD COLUMN `root_bundle_id` VARCHAR(32) NULL COMMENT '主菲号ID' AFTER `id`,
    ADD COLUMN `parent_bundle_id` VARCHAR(32) NULL COMMENT '父菲号ID' AFTER `root_bundle_id`,
    ADD COLUMN `source_bundle_id` VARCHAR(32) NULL COMMENT '拆分来源菲号ID' AFTER `parent_bundle_id`,
    ADD COLUMN `bundle_label` VARCHAR(64) NULL COMMENT '执行菲号标签' AFTER `bundle_no`,
    ADD COLUMN `split_status` VARCHAR(20) NOT NULL DEFAULT 'normal' COMMENT 'normal/split_parent/split_child' AFTER `status`,
    ADD COLUMN `split_seq` INT NOT NULL DEFAULT 0 COMMENT '拆分序号' AFTER `split_status`;

UPDATE `t_cutting_bundle`
SET `root_bundle_id` = `id`
WHERE `root_bundle_id` IS NULL;

UPDATE `t_cutting_bundle`
SET `bundle_label` = CAST(`bundle_no` AS CHAR)
WHERE (`bundle_label` IS NULL OR `bundle_label` = '')
  AND `bundle_no` IS NOT NULL;

CREATE INDEX `idx_cb_root_bundle_id` ON `t_cutting_bundle` (`root_bundle_id`);
CREATE INDEX `idx_cb_parent_bundle_id` ON `t_cutting_bundle` (`parent_bundle_id`);
CREATE INDEX `idx_cb_split_status` ON `t_cutting_bundle` (`split_status`);

CREATE TABLE IF NOT EXISTS `t_cutting_bundle_split_log` (
    `id` VARCHAR(32) NOT NULL PRIMARY KEY,
    `tenant_id` BIGINT DEFAULT NULL,
    `root_bundle_id` VARCHAR(32) NOT NULL,
    `source_bundle_id` VARCHAR(32) NOT NULL,
    `source_bundle_no` INT DEFAULT NULL,
    `source_bundle_label` VARCHAR(64) DEFAULT NULL,
    `source_quantity` INT NOT NULL,
    `completed_quantity` INT NOT NULL,
    `transfer_quantity` INT NOT NULL,
    `current_process_name` VARCHAR(64) NOT NULL,
    `from_worker_id` VARCHAR(32) DEFAULT NULL,
    `from_worker_name` VARCHAR(100) DEFAULT NULL,
    `to_worker_id` VARCHAR(32) DEFAULT NULL,
    `to_worker_name` VARCHAR(100) DEFAULT NULL,
    `reason` VARCHAR(255) DEFAULT NULL,
    `completed_bundle_id` VARCHAR(32) DEFAULT NULL,
    `completed_bundle_label` VARCHAR(64) DEFAULT NULL,
    `transfer_bundle_id` VARCHAR(32) DEFAULT NULL,
    `transfer_bundle_label` VARCHAR(64) DEFAULT NULL,
    `rollback_time` DATETIME DEFAULT NULL,
    `rollback_by` VARCHAR(50) DEFAULT NULL,
    `rollback_reason` VARCHAR(255) DEFAULT NULL,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `creator` VARCHAR(50) DEFAULT NULL,
    `updater` VARCHAR(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX `idx_cbsl_root_bundle_id` ON `t_cutting_bundle_split_log` (`root_bundle_id`);
CREATE INDEX `idx_cbsl_source_bundle_id` ON `t_cutting_bundle_split_log` (`source_bundle_id`);
