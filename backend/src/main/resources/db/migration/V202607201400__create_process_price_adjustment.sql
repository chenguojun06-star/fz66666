-- 工序单价调整记录表
-- 用于记录管理员对订单工序单价的手动调整，支持审计追踪
-- 调整只影响当前订单的下游结算，不回流到工序模板
CREATE TABLE IF NOT EXISTS `t_process_price_adjustment` (
    `id` VARCHAR(36) NOT NULL,
    `tenant_id` BIGINT NOT NULL,
    `order_id` VARCHAR(36) NOT NULL,
    `order_no` VARCHAR(50) DEFAULT NULL,
    `bundle_id` VARCHAR(36) DEFAULT NULL,
    `bundle_no` VARCHAR(50) DEFAULT NULL,
    `process_name` VARCHAR(100) NOT NULL,
    `process_code` VARCHAR(50) DEFAULT NULL,
    `progress_stage` VARCHAR(50) DEFAULT NULL,
    `original_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    `adjusted_price` DECIMAL(10,2) NOT NULL,
    `reason` TEXT NOT NULL,
    `adjusted_by` VARCHAR(36) NOT NULL,
    `adjusted_by_name` VARCHAR(50) DEFAULT NULL,
    `adjusted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `delete_flag` INT NOT NULL DEFAULT 0,
    `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP,
    `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_ppa_tenant` (`tenant_id`),
    INDEX `idx_ppa_order` (`order_id`),
    INDEX `idx_ppa_order_no` (`order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
