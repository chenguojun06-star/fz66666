-- ==================================================================
-- V202705020001: 补齐 t_shipment_reconciliation 基础列 + t_pattern_production 建表
-- ==================================================================
-- 背景：
--   1) t_shipment_reconciliation 的 init.sql 仅 8 列，Entity 期望 39 列。
--      COLUMN_FIXES 已覆盖 22 列，仍有 12 基础列未被任何迁移覆盖：
--        customer_id, customer_name, style_id, style_no, style_name,
--        order_id, order_no, quantity, unit_price, deduction_amount,
--        final_amount, remark
--      云端首次部署时这些列不存在 → MyBatis-Plus 映射 null → 利润对账页面 500
--
--   2) t_pattern_production 不存在于 init.sql / Flyway CREATE TABLE /
--      ProductionTableMigrator / DbTableDefinitions 中。
--      COLUMN_FIXES 和 Preflight 均依赖该表存在但从未建表。
--      新增 CREATE TABLE IF NOT EXISTS，包含 Entity 的所有基础列。
--
-- 安全模板参考：V202608051400__fix_production_order_skc.sql
--   不在 SET @s 中包含 COMMENT / DEFAULT '字符串字面量'
-- ==================================================================

-- ── 1. t_shipment_reconciliation — 补齐 12 缺失基础列 ──
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'customer_id') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `customer_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'customer_name') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `customer_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'style_id') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `style_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'style_no') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `style_no` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'style_name') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `style_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'order_id') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `order_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'order_no') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `order_no` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'quantity') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `quantity` INT DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'unit_price') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `unit_price` DECIMAL(15,2) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'deduction_amount') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `deduction_amount` DECIMAL(15,2) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'final_amount') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `final_amount` DECIMAL(15,2) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_shipment_reconciliation'
       AND COLUMN_NAME  = 'remark') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `remark` VARCHAR(500) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── 2. t_pattern_production — 首次建表（若已存在则跳过）──
CREATE TABLE IF NOT EXISTS `t_pattern_production` (
    `id`                VARCHAR(64)  NOT NULL,
    `style_id`          VARCHAR(64)  DEFAULT NULL,
    `style_no`          VARCHAR(64)  DEFAULT NULL,
    `color`             VARCHAR(50)  DEFAULT NULL,
    `quantity`          INT          DEFAULT NULL,
    `release_time`      DATETIME     DEFAULT NULL,
    `delivery_time`     DATETIME     DEFAULT NULL,
    `receiver`          VARCHAR(100) DEFAULT NULL,
    `receive_time`      DATETIME     DEFAULT NULL,
    `complete_time`     DATETIME     DEFAULT NULL,
    `pattern_maker`     VARCHAR(100) DEFAULT NULL,
    `progress_nodes`    TEXT         DEFAULT NULL,
    `status`            VARCHAR(20)  DEFAULT NULL,
    `create_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `create_by`         VARCHAR(64)  DEFAULT NULL,
    `update_by`         VARCHAR(64)  DEFAULT NULL,
    `delete_flag`       INT          DEFAULT 0,
    PRIMARY KEY (`id`),
    INDEX `idx_pp_style_no` (`style_no`),
    INDEX `idx_pp_status`   (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
