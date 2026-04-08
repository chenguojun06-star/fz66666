-- ============================================================================
-- V202608131000 — 修复成品库存页面 500 错误（3 张表 schema 漂移）
-- 根因：t_product_outstock 表不存在 + t_product_sku 缺 2 列 + t_style_attachment 缺列
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1: 创建 t_product_outstock 表（如果不存在）
-- 背景：该表仅由 DataInitializer 创建，云端 FASHION_DB_INITIALIZER_ENABLED=false
--        导致表从未被创建，所有 ProductOutstock 查询直接 500
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `t_product_outstock` (
  `id` VARCHAR(64) NOT NULL,
  `outstock_no` VARCHAR(64) DEFAULT NULL,
  `order_id` VARCHAR(64) DEFAULT NULL,
  `order_no` VARCHAR(64) DEFAULT NULL,
  `style_id` VARCHAR(64) DEFAULT NULL,
  `style_no` VARCHAR(64) DEFAULT NULL,
  `style_name` VARCHAR(200) DEFAULT NULL,
  `outstock_quantity` INT DEFAULT 0,
  `outstock_type` VARCHAR(32) DEFAULT NULL,
  `warehouse` VARCHAR(100) DEFAULT NULL,
  `remark` TEXT,
  `create_time` DATETIME DEFAULT NULL,
  `update_time` DATETIME DEFAULT NULL,
  `delete_flag` INT DEFAULT 0,
  `operator_id` VARCHAR(64) DEFAULT NULL,
  `operator_name` VARCHAR(100) DEFAULT NULL,
  `creator_id` VARCHAR(64) DEFAULT NULL,
  `creator_name` VARCHAR(100) DEFAULT NULL,
  `tenant_id` BIGINT DEFAULT NULL,
  `sku_code` VARCHAR(100) DEFAULT NULL,
  `color` VARCHAR(50) DEFAULT NULL,
  `size` VARCHAR(50) DEFAULT NULL,
  `cost_price` DECIMAL(12,2) DEFAULT NULL,
  `sales_price` DECIMAL(12,2) DEFAULT NULL,
  `tracking_no` VARCHAR(100) DEFAULT NULL,
  `express_company` VARCHAR(50) DEFAULT NULL,
  `receive_status` VARCHAR(20) DEFAULT NULL,
  `receive_time` DATETIME DEFAULT NULL,
  `received_by` VARCHAR(36) DEFAULT NULL,
  `received_by_name` VARCHAR(100) DEFAULT NULL,
  `customer_name` VARCHAR(100) DEFAULT NULL,
  `customer_phone` VARCHAR(50) DEFAULT NULL,
  `shipping_address` VARCHAR(500) DEFAULT NULL,
  `total_amount` DECIMAL(12,2) DEFAULT NULL,
  `paid_amount` DECIMAL(12,2) DEFAULT 0.00,
  `payment_status` VARCHAR(20) DEFAULT NULL,
  `settlement_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_outstock_style_id` (`style_id`),
  KEY `idx_outstock_style_no` (`style_no`),
  KEY `idx_outstock_order_id` (`order_id`),
  KEY `idx_outstock_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2: t_product_sku 补齐 stock_quantity + tenant_id
-- 背景：V7 CREATE TABLE 仅 14 列，缺少这 2 列
-- ────────────────────────────────────────────────────────────────────────────

-- stock_quantity
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_sku' AND COLUMN_NAME='stock_quantity')=0,
    'ALTER TABLE `t_product_sku` ADD COLUMN `stock_quantity` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tenant_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_sku' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_product_sku` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3: t_style_attachment 补齐 5 列
-- 背景：V202608011400 使用了 DEFAULT ''active'' 导致 Flyway 解析器截断，列可能未添加
-- 注意：此处不在 SET @s 内使用 COMMENT 或单引号默认值，避免 Flyway 截断
-- ────────────────────────────────────────────────────────────────────────────

-- version
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='version')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `version` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- version_remark
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='version_remark')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `version_remark` VARCHAR(200) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- status (不在 SET @s 里写 DEFAULT 'active'，改用后续 UPDATE 回填)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='status')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- parent_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='parent_id')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `parent_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tenant_id
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_attachment' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_style_attachment` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 回填 status 默认值：已存在但 status 为 NULL 的行设为 active
UPDATE `t_style_attachment` SET `status` = 'active' WHERE `status` IS NULL;
