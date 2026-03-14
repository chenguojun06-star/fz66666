-- V20260424001: 一次性修复云端三张核心表全部缺失列
-- =========================================================================
-- 问题根因: 历史 Flyway 脚本在 SET @s = '...' 字符串内使用 COMMENT ''xx''
--           Flyway SQL 解析器将 '' 视为字符串结束符，导致 ALTER TABLE 被截断
--           脚本标记为"已执行"但列实际从未创建 → MyBatis SELECT * 查到不存在的列 → 500
-- 修复策略: 所有 ALTER TABLE 均不带 COMMENT，使用 INFORMATION_SCHEMA 幂等守卫
-- 影响表:   t_production_order / t_product_warehousing / t_material_database
-- =========================================================================


-- ==========================================================================
-- Part 1: t_product_warehousing（质检入库表）
-- 原始建表来源: FinanceTableMigrator（云端已禁用 FASHION_DB_INITIALIZER_ENABLED=false）
-- ==========================================================================

CREATE TABLE IF NOT EXISTS `t_product_warehousing` (
    `id`                      VARCHAR(36)   NOT NULL,
    `warehousing_no`          VARCHAR(50)   DEFAULT NULL,
    `order_id`                VARCHAR(36)   DEFAULT NULL,
    `order_no`                VARCHAR(50)   DEFAULT NULL,
    `style_id`                VARCHAR(36)   DEFAULT NULL,
    `style_no`                VARCHAR(50)   DEFAULT NULL,
    `style_name`              VARCHAR(100)  DEFAULT NULL,
    `warehousing_quantity`    INT           DEFAULT 0,
    `qualified_quantity`      INT           DEFAULT 0,
    `unqualified_quantity`    INT           DEFAULT 0,
    `warehousing_type`        VARCHAR(20)   DEFAULT NULL,
    `warehouse`               VARCHAR(50)   DEFAULT NULL,
    `warehousing_start_time`  DATETIME      DEFAULT NULL,
    `warehousing_end_time`    DATETIME      DEFAULT NULL,
    `warehousing_operator_id`   VARCHAR(36)  DEFAULT NULL,
    `warehousing_operator_name` VARCHAR(100) DEFAULT NULL,
    `quality_status`          VARCHAR(20)   DEFAULT NULL,
    `cutting_bundle_id`       VARCHAR(36)   DEFAULT NULL,
    `cutting_bundle_no`       INT           DEFAULT NULL,
    `cutting_bundle_qr_code`  VARCHAR(100)  DEFAULT NULL,
    `unqualified_image_urls`  TEXT          DEFAULT NULL,
    `defect_category`         VARCHAR(64)   DEFAULT NULL,
    `defect_remark`           VARCHAR(500)  DEFAULT NULL,
    `repair_remark`           VARCHAR(500)  DEFAULT NULL,
    `receiver_id`             VARCHAR(64)   DEFAULT NULL,
    `receiver_name`           VARCHAR(100)  DEFAULT NULL,
    `received_time`           DATETIME      DEFAULT NULL,
    `inspection_status`       VARCHAR(20)   DEFAULT NULL,
    `quality_operator_id`     VARCHAR(50)   DEFAULT NULL,
    `quality_operator_name`   VARCHAR(50)   DEFAULT NULL,
    `tenant_id`               BIGINT        DEFAULT NULL,
    `create_time`             DATETIME      DEFAULT CURRENT_TIMESTAMP,
    `update_time`             DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`             INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- t_product_warehousing: 逐列补齐（表已存在但缺列的情况）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_no')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `warehousing_no` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='style_id')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `style_id` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_start_time')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `warehousing_start_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_end_time')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `warehousing_end_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_operator_id')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `warehousing_operator_id` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='warehousing_operator_name')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `warehousing_operator_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='cutting_bundle_id')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `cutting_bundle_id` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='cutting_bundle_no')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `cutting_bundle_no` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='cutting_bundle_qr_code')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `cutting_bundle_qr_code` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='unqualified_image_urls')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `unqualified_image_urls` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='defect_category')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `defect_category` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='defect_remark')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `defect_remark` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='repair_remark')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `repair_remark` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='receiver_id')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `receiver_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='receiver_name')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `receiver_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='received_time')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `received_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='inspection_status')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `inspection_status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='quality_operator_id')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `quality_operator_id` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='quality_operator_name')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `quality_operator_name` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='tenant_id')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ==========================================================================
-- Part 2: t_production_order（生产订单表）
-- 受影响脚本: V42, V2026022603, V2026022604, V20260307, V20260309,
--            V20260313, V20260319, V20260419001, V20260420001
-- 全部因 COMMENT '' 导致列未创建
-- ==========================================================================

-- from V42
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_manually_completed')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_manually_completed` INT DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_by` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_by_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_by_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V2026022603
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='urgency_level')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `urgency_level` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V2026022604
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='plate_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `plate_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V20260307
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='org_unit_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `org_unit_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='parent_org_unit_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `parent_org_unit_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='parent_org_unit_name')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `parent_org_unit_name` VARCHAR(128) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='org_path')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `org_path` VARCHAR(1000) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_type` VARCHAR(32) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V20260309
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='skc')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `skc` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V20260313
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='order_biz_type')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `order_biz_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V20260319
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='customer_id')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `customer_id` VARCHAR(36) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V20260419001
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='remarks')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `remarks` TEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='expected_ship_date')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `expected_ship_date` DATE DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='node_operations')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `node_operations` LONGTEXT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirmed_at')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirmed_at` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='procurement_confirm_remark')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `procurement_confirm_remark` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- from V20260420001
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='qr_code')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `qr_code` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_contact_person')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_contact_person` VARCHAR(50) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='factory_contact_phone')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_contact_phone` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- version (乐观锁 @Version, 原始建表可能遗漏)
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='version')=0,
    'ALTER TABLE `t_production_order` ADD COLUMN `version` INT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ==========================================================================
-- Part 3: t_material_database（面辅料数据库表）
-- V20260421001 应已修复大部分列，此处做安全兜底
-- ==========================================================================

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='description')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `description` VARCHAR(255) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='image')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `image` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='specifications')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `specifications` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='material_type')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `material_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;


-- ==========================================================================
-- Part 4: 索引补齐（幂等）
-- ==========================================================================

SET @i = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_tenant_id');
SET @s = IF(@i=0, 'CREATE INDEX `idx_pw_tenant_id` ON `t_product_warehousing` (`tenant_id`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @i = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND INDEX_NAME='idx_pw_order_id');
SET @s = IF(@i=0, 'CREATE INDEX `idx_pw_order_id` ON `t_product_warehousing` (`order_id`)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
