-- ============================================================
-- 修复「实体 ↔ 真实数据库」结构漂移
-- ============================================================
-- 背景：
--   scripts/check-entity-db-drift.py 扫描出 17 张实体表在库中不存在、
--   18 张表缺列。历史库被还原/重建后会丢表，而 flyway_schema_history
--   中的记录仍是 success=1，已 applied 的迁移不会重跑，导致接口 500
--   （典型：GET /api/system/tenant/public-list → Table 't_tenant' doesn't exist）。
--
-- 处理策略：
--   1. 缺失表：CREATE TABLE IF NOT EXISTS（优先复用仓库既有 DDL）；
--   2. 缺列：INFORMATION_SCHEMA 守卫 + PREPARE 动态 ALTER，可重复执行；
--   3. 不删除、不修改既有列，只做补齐，保证幂等与可回滚。
-- ============================================================

-- ---------- 缺失表：t_app_order（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_app_order` (
    `id`               BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `order_no`         VARCHAR(50)  NOT NULL COMMENT '订单号',
    `tenant_id`        BIGINT       NOT NULL COMMENT '租户ID',
    `tenant_name`      VARCHAR(100) DEFAULT NULL,
    `app_id`           BIGINT       NOT NULL COMMENT '应用ID',
    `app_code`         VARCHAR(50)  NOT NULL,
    `app_name`         VARCHAR(100) NOT NULL,
    `order_type`       VARCHAR(20)  NOT NULL COMMENT '订单类型: NEW/RENEW/UPGRADE',
    `subscription_type` VARCHAR(20) NOT NULL COMMENT '订阅类型: TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `user_count`       INT          DEFAULT 1,
    `unit_price`       DECIMAL(10,2) DEFAULT 0.00,
    `total_amount`     DECIMAL(10,2) NOT NULL,
    `discount_amount`  DECIMAL(10,2) DEFAULT 0.00,
    `actual_amount`    DECIMAL(10,2) NOT NULL,
    `status`           VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '状态: PENDING/PAID/CANCELED/REFUNDED',
    `payment_method`   VARCHAR(20)  DEFAULT NULL,
    `payment_time`     DATETIME     DEFAULT NULL,
    `contact_name`     VARCHAR(100) DEFAULT NULL,
    `contact_phone`    VARCHAR(20)  DEFAULT NULL,
    `contact_email`    VARCHAR(100) DEFAULT NULL,
    `company_name`     VARCHAR(200) DEFAULT NULL,
    `invoice_required` TINYINT      DEFAULT 0,
    `invoice_title`    VARCHAR(200) DEFAULT NULL,
    `invoice_tax_no`   VARCHAR(50)  DEFAULT NULL,
    `remark`           VARCHAR(500) DEFAULT NULL,
    `created_by`       VARCHAR(64)  DEFAULT NULL,
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`      TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_order_no` (`order_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_payment_time` (`payment_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用购买订单';

-- ---------- 缺失表：t_app_store（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_app_store` (
    `id`           BIGINT        NOT NULL AUTO_INCREMENT COMMENT '主键',
    `app_code`     VARCHAR(50)   NOT NULL COMMENT '应用编码',
    `app_name`     VARCHAR(100)  NOT NULL COMMENT '应用名称',
    `app_icon`     VARCHAR(200)  DEFAULT NULL COMMENT '应用图标',
    `app_desc`     VARCHAR(500)  DEFAULT NULL COMMENT '应用简介',
    `app_detail`   TEXT          DEFAULT NULL COMMENT '应用详细说明',
    `category`     VARCHAR(50)   DEFAULT NULL COMMENT '应用分类',
    `price_type`   VARCHAR(20)   NOT NULL DEFAULT 'MONTHLY' COMMENT '计费类型: FREE/MONTHLY/YEARLY/ONCE',
    `price_monthly` DECIMAL(10,2) DEFAULT 0.00 COMMENT '月付价格',
    `price_yearly`  DECIMAL(10,2) DEFAULT 0.00 COMMENT '年付价格',
    `price_once`    DECIMAL(10,2) DEFAULT 0.00 COMMENT '买断价格',
    `sort_order`   INT           DEFAULT 0 COMMENT '排序',
    `is_hot`       TINYINT       DEFAULT 0 COMMENT '是否热门',
    `is_new`       TINYINT       DEFAULT 0 COMMENT '是否新应用',
    `status`       VARCHAR(20)   NOT NULL DEFAULT 'PUBLISHED' COMMENT '状态: DRAFT/PUBLISHED/OFFLINE',
    `features`     TEXT          DEFAULT NULL COMMENT '功能列表JSON',
    `screenshots`  TEXT          DEFAULT NULL COMMENT '应用截图JSON',
    `min_users`    INT           DEFAULT 1 COMMENT '最少用户数',
    `max_users`    INT           DEFAULT 999 COMMENT '最大用户数',
    `trial_days`   INT           DEFAULT 0 COMMENT '试用天数',
    `remark`       VARCHAR(500)  DEFAULT NULL COMMENT '备注',
    `create_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`  DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `delete_flag`  TINYINT       DEFAULT 0 COMMENT '逻辑删除',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_code` (`app_code`),
    KEY `idx_category` (`category`),
    KEY `idx_status` (`status`),
    KEY `idx_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='应用商店-可购买应用列表';

-- ---------- 缺失表：t_finished_settlement_approval（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_finished_settlement_approval` (
    `settlement_id`    VARCHAR(64)  NOT NULL COMMENT '成品结算ID',
    `status`           VARCHAR(20)  NOT NULL DEFAULT 'pending' COMMENT '审批状态: pending/approved',
    `approved_by_id`   VARCHAR(64)  DEFAULT NULL COMMENT '审批人ID',
    `approved_by_name` VARCHAR(100) DEFAULT NULL COMMENT '审批人名称',
    `approved_time`    DATETIME     DEFAULT NULL COMMENT '审批时间',
    `tenant_id`        BIGINT       DEFAULT NULL COMMENT '租户ID',
    `create_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`settlement_id`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_status`    (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='成品结算审批状态';

-- ---------- 缺失表：t_material_picking（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_material_picking` (
  `id` varchar(36) NOT NULL COMMENT '主键ID',
  `picking_no` varchar(50) NOT NULL COMMENT '领料单号',
  `order_id` varchar(36) DEFAULT NULL COMMENT '生产订单ID',
  `order_no` varchar(50) DEFAULT NULL COMMENT '生产订单号',
  `style_id` varchar(36) DEFAULT NULL COMMENT '款式ID',
  `style_no` varchar(50) DEFAULT NULL COMMENT '款号',
  `picker_id` varchar(36) DEFAULT NULL COMMENT '领料人ID',
  `picker_name` varchar(50) DEFAULT NULL COMMENT '领料人姓名',
  `pick_time` datetime DEFAULT NULL COMMENT '领料时间',
  `status` varchar(20) DEFAULT 'completed' COMMENT '状态',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `delete_flag` int(11) DEFAULT '0' COMMENT '删除标记',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_picking_no` (`picking_no`),
  KEY `idx_order_id` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产领料单';
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='pickup_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `pickup_type` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='usage_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `usage_type` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='purchase_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `purchase_id` VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='pattern_production_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `pattern_production_id` VARCHAR(36)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='audit_status');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `audit_status` VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='auditor_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `auditor_id` VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='auditor_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `auditor_name` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='audit_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `audit_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='audit_remark');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `audit_remark` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='finance_status');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `finance_status` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='finance_remark');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `finance_remark` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_material_picking_item（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_material_picking_item` (
  `id` varchar(36) NOT NULL COMMENT '主键ID',
  `picking_id` varchar(36) NOT NULL COMMENT '领料单ID',
  `material_stock_id` varchar(36) DEFAULT NULL COMMENT '库存ID',
  `material_id` varchar(36) DEFAULT NULL COMMENT '物料ID',
  `material_code` varchar(50) DEFAULT NULL COMMENT '物料编码',
  `material_name` varchar(100) DEFAULT NULL COMMENT '物料名称',
  `color` varchar(50) DEFAULT NULL COMMENT '颜色',
  `size` varchar(50) DEFAULT NULL COMMENT '规格/尺码',
  `quantity` int(11) NOT NULL DEFAULT '0' COMMENT '领料数量',
  `unit` varchar(20) DEFAULT NULL COMMENT '单位',
  `create_time` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_picking_id` (`picking_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='生产领料明细';
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='specification');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `specification` VARCHAR(200)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='unit_price');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `unit_price` DECIMAL(10,2)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='fabric_width');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `fabric_width` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='fabric_composition');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `fabric_composition` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='supplier_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `supplier_name` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='warehouse_location');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `warehouse_location` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='material_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `material_type` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_picking_item` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_material_stock（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_material_stock` (
  `id` varchar(64) NOT NULL COMMENT '主键ID',
  `material_id` varchar(64) DEFAULT NULL COMMENT '关联物料ID',
  `material_code` varchar(64) DEFAULT NULL COMMENT '物料编码',
  `material_name` varchar(128) DEFAULT NULL COMMENT '物料名称',
  `material_type` varchar(64) DEFAULT NULL COMMENT '物料类型',
  `specifications` varchar(255) DEFAULT NULL COMMENT '规格',
  `unit` varchar(32) DEFAULT NULL COMMENT '单位',
  `color` varchar(64) DEFAULT NULL COMMENT '颜色',
  `size` varchar(64) DEFAULT NULL COMMENT '尺码',
  `supplier_name` varchar(128) DEFAULT NULL COMMENT '供应商名称',
  `quantity` int DEFAULT '0' COMMENT '当前库存数量',
  `locked_quantity` int DEFAULT '0' COMMENT '占用/冻结数量',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `delete_flag` int DEFAULT '0' COMMENT '删除标记',
  `location` varchar(128) DEFAULT NULL COMMENT '存放位置',
  `safety_stock` int DEFAULT '100' COMMENT '安全库存',
  PRIMARY KEY (`id`),
  KEY `idx_material_code` (`material_code`),
  KEY `idx_material_id` (`material_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='面辅料库存表';
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='supplier_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `supplier_id` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='supplier_contact_person');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `supplier_contact_person` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='supplier_contact_phone');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `supplier_contact_phone` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='fabric_width');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `fabric_width` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='fabric_weight');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `fabric_weight` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='fabric_composition');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `fabric_composition` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='warehouse_area_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `warehouse_area_id` VARCHAR(64)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='warehouse_area_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `warehouse_area_name` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='unit_price');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `unit_price` DECIMAL(10,2)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='conversion_rate');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `conversion_rate` DECIMAL(10,4)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='total_value');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `total_value` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='last_inbound_date');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `last_inbound_date` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='last_outbound_date');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `last_outbound_date` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='version');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `version` INT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_stock' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_stock` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_payment_account（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS t_payment_account (
    id VARCHAR(64) PRIMARY KEY,
    account_name VARCHAR(128),
    account_no VARCHAR(64),
    bank_name VARCHAR(128),
    balance DECIMAL(15,2),
    tenant_id BIGINT DEFAULT NULL,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='id');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='owner_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `owner_type` VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='owner_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `owner_id` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='owner_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `owner_name` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='account_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `account_type` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='account_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `account_name` VARCHAR(64)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='account_no');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `account_no` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='bank_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `bank_name` VARCHAR(128)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='bank_branch');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `bank_branch` VARCHAR(128)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='qr_code_url');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `qr_code_url` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='is_default');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `is_default` TINYINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='status');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `status` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='create_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `create_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='update_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `update_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payment_account' AND COLUMN_NAME='create_by');
SET @s = IF(@c=0, 'ALTER TABLE `t_payment_account` ADD COLUMN `create_by` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_sample_loan（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_sample_loan` (
  `id` varchar(64) NOT NULL COMMENT '主键ID',
  `sample_stock_id` varchar(64) NOT NULL COMMENT '样衣库存ID',
  `borrower` varchar(64) DEFAULT NULL COMMENT '借用人',
  `borrower_id` varchar(64) DEFAULT NULL COMMENT '借用人ID',
  `loan_date` datetime DEFAULT NULL COMMENT '借出时间',
  `expected_return_date` datetime DEFAULT NULL COMMENT '预计归还时间',
  `return_date` datetime DEFAULT NULL COMMENT '实际归还时间',
  `quantity` int DEFAULT '1' COMMENT '借用数量',
  `status` varchar(32) DEFAULT 'borrowed' COMMENT '状态: borrowed(借出中), returned(已归还), lost(丢失)',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `delete_flag` int DEFAULT '0' COMMENT '删除标记',
  PRIMARY KEY (`id`),
  KEY `idx_sample_stock_id` (`sample_stock_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样衣借还记录表';
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `lend_to` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `lend_to_id` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `lend_to_type` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_factory_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `lend_to_factory_id` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='lend_to_factory_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `lend_to_factory_name` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='transfer_from_loan_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `transfer_from_loan_id` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='remaining_quantity');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `remaining_quantity` INT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='operator_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `operator_id` VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='operator_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `operator_name` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='warehouse_area_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `warehouse_area_id` VARCHAR(64)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='warehouse_area_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `warehouse_area_name` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_loan' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_loan` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_sample_stock（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_sample_stock` (
  `id` varchar(64) NOT NULL COMMENT '主键ID',
  `style_id` varchar(64) DEFAULT NULL COMMENT '关联款式ID',
  `style_no` varchar(64) DEFAULT NULL COMMENT '款号',
  `style_name` varchar(128) DEFAULT NULL COMMENT '款式名称',
  `sample_type` varchar(32) DEFAULT 'development' COMMENT '样衣类型: development(开发样), pre_production(产前样), shipment(大货样), sales(销售样)',
  `color` varchar(64) DEFAULT NULL COMMENT '颜色',
  `size` varchar(64) DEFAULT NULL COMMENT '尺码',
  `quantity` int DEFAULT '0' COMMENT '库存总数',
  `loaned_quantity` int DEFAULT '0' COMMENT '借出数量',
  `location` varchar(128) DEFAULT NULL COMMENT '存放位置',
  `image_url` varchar(512) DEFAULT NULL COMMENT '样衣图片',
  `remark` varchar(512) DEFAULT NULL COMMENT '备注',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `delete_flag` int DEFAULT '0' COMMENT '删除标记',
  PRIMARY KEY (`id`),
  KEY `idx_style_id` (`style_id`),
  KEY `idx_style_no` (`style_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='样衣库存表';
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_stock' AND COLUMN_NAME='warehouse_area_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_stock` ADD COLUMN `warehouse_area_id` VARCHAR(64)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_stock' AND COLUMN_NAME='warehouse_area_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_stock` ADD COLUMN `warehouse_area_name` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_stock' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_stock` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_sample_stock' AND COLUMN_NAME='version');
SET @s = IF(@c=0, 'ALTER TABLE `t_sample_stock` ADD COLUMN `version` INT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_style_size_price（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS t_style_size_price (
    id VARCHAR(36) PRIMARY KEY COMMENT '主键ID',
    style_id BIGINT NOT NULL COMMENT '款号ID',
    process_code VARCHAR(50) NOT NULL COMMENT '工序编码',
    process_name VARCHAR(100) NOT NULL COMMENT '工序名称',
    size VARCHAR(20) NOT NULL COMMENT '尺码',
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '该尺码的单价',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_style_id (style_id),
    INDEX idx_process_code (process_code),
    INDEX idx_size (size),
    UNIQUE KEY uk_style_process_size (style_id, process_code, size)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='样衣多码单价配置表';
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='style_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `style_id` VARCHAR(64)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='process_code');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `process_code` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='process_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `process_name` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='progress_stage');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `progress_stage` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='size');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `size` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='price');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `price` DECIMAL(10,2)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='create_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `create_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='update_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `update_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size_price' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size_price` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_tenant（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_tenant` (
    `id`             BIGINT       NOT NULL AUTO_INCREMENT COMMENT '租户ID',
    `tenant_name`    VARCHAR(100) NOT NULL COMMENT '租户名称（公司/工厂名）',
    `tenant_code`    VARCHAR(50)  NOT NULL COMMENT '租户编码（唯一标识）',
    `owner_user_id`  BIGINT       DEFAULT NULL COMMENT '租户主账号用户ID',
    `contact_name`   VARCHAR(50)  DEFAULT NULL COMMENT '联系人',
    `contact_phone`  VARCHAR(20)  DEFAULT NULL COMMENT '联系电话',
    `status`         VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    `max_users`      INT          DEFAULT 50 COMMENT '最大用户数限制（0=不限制）',
    `expire_time`    DATETIME     DEFAULT NULL COMMENT '过期时间（null=永不过期）',
    `remark`         VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_time`    DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time`    DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY `uk_tenant_code` (`tenant_code`),
    KEY `idx_status` (`status`),
    KEY `idx_owner_user_id` (`owner_user_id`),
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='租户表';
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_title');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `invoice_title` VARCHAR(200)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_tax_no');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `invoice_tax_no` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `invoice_bank_name` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_bank_account');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `invoice_bank_account` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_address');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `invoice_address` VARCHAR(200)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='invoice_phone');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `invoice_phone` VARCHAR(30)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='paid_status');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `paid_status` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='plan_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `plan_type` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='enabled_modules');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `enabled_modules` VARCHAR(2000)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='monthly_fee');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `monthly_fee` DECIMAL(10,2)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='storage_quota_mb');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `storage_quota_mb` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='storage_used_mb');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `storage_used_mb` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='billing_cycle');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `billing_cycle` VARCHAR(10)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='apply_username');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `apply_username` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='apply_password');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `apply_password` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='tenant_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `tenant_type` VARCHAR(30)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='wechat_work_webhook_url');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `wechat_work_webhook_url` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='feishu_webhook_url');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `feishu_webhook_url` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='dingtalk_webhook_url');
SET @s = IF(@c=0, 'ALTER TABLE `t_tenant` ADD COLUMN `dingtalk_webhook_url` VARCHAR(500)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 缺失表：t_tenant_app（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_tenant_app` (
    `id`                    VARCHAR(64)  NOT NULL COMMENT '主键UUID',
    `tenant_id`             BIGINT       NOT NULL COMMENT '租户ID',
    `app_name`              VARCHAR(100) NOT NULL COMMENT '应用名称',
    `app_type`              VARCHAR(50)  NOT NULL COMMENT '应用类型: ORDER_SYNC/QUALITY_FEEDBACK/LOGISTICS_SYNC/PAYMENT_SYNC',
    `app_key`               VARCHAR(64)  NOT NULL COMMENT '应用密钥ID',
    `app_secret`            VARCHAR(128) NOT NULL COMMENT '应用密钥',
    `status`                VARCHAR(20)  NOT NULL DEFAULT 'active' COMMENT '状态: active/disabled/expired',
    `callback_url`          VARCHAR(500) DEFAULT NULL COMMENT '客户回调URL',
    `callback_secret`       VARCHAR(64)  DEFAULT NULL COMMENT '回调签名密钥',
    `external_api_url`      VARCHAR(500) DEFAULT NULL COMMENT '客户系统API地址',
    `config_json`           TEXT         DEFAULT NULL COMMENT '对接配置JSON',
    `daily_quota`           INT          DEFAULT 0 COMMENT '日调用上限',
    `daily_used`            INT          DEFAULT 0 COMMENT '今日已调用次数',
    `last_quota_reset_time` DATETIME     DEFAULT NULL,
    `total_calls`           BIGINT       DEFAULT 0 COMMENT '总调用次数',
    `last_call_time`        DATETIME     DEFAULT NULL,
    `expire_time`           DATETIME     DEFAULT NULL COMMENT '过期时间',
    `remark`                VARCHAR(500) DEFAULT NULL,
    `created_by`            VARCHAR(64)  DEFAULT NULL,
    `create_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`           TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_app_key` (`app_key`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_type` (`app_type`),
    KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用管理';

-- ---------- 缺失表：t_tenant_app_log（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_tenant_app_log` (
    `id`           VARCHAR(64)  NOT NULL COMMENT '主键UUID',
    `app_id`       VARCHAR(64)  DEFAULT NULL COMMENT '应用ID',
    `tenant_id`    BIGINT       DEFAULT NULL COMMENT '租户ID',
    `app_type`     VARCHAR(50)  DEFAULT NULL COMMENT '应用类型',
    `direction`    VARCHAR(20)  DEFAULT NULL COMMENT '方向: INBOUND/OUTBOUND',
    `http_method`  VARCHAR(10)  DEFAULT NULL,
    `request_path` VARCHAR(500) DEFAULT NULL,
    `request_body` TEXT         DEFAULT NULL,
    `response_code` INT         DEFAULT NULL,
    `response_body` TEXT        DEFAULT NULL,
    `cost_ms`      BIGINT       DEFAULT NULL COMMENT '耗时(毫秒)',
    `result`       VARCHAR(20)  DEFAULT NULL COMMENT '结果: SUCCESS/FAILED/ERROR',
    `error_message` VARCHAR(500) DEFAULT NULL,
    `client_ip`    VARCHAR(50)  DEFAULT NULL,
    `create_time`  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_app_id`     (`app_id`),
    KEY `idx_tenant_id`  (`tenant_id`),
    KEY `idx_create_time`(`create_time`),
    KEY `idx_result`     (`result`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户应用调用日志';

-- ---------- 缺失表：t_tenant_permission_ceiling（按实体生成） ----------
CREATE TABLE IF NOT EXISTS `t_tenant_permission_ceiling` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT DEFAULT NULL,
  `permission_id` BIGINT DEFAULT NULL,
  `status` VARCHAR(20) DEFAULT NULL,
  `create_time` DATETIME DEFAULT NULL,
  `update_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 缺失表：t_tenant_subscription（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS `t_tenant_subscription` (
    `id`                BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键',
    `subscription_no`  VARCHAR(50)   NOT NULL COMMENT '订阅编号',
    `tenant_id`         BIGINT       NOT NULL COMMENT '租户ID',
    `tenant_name`       VARCHAR(100) DEFAULT NULL COMMENT '租户名称',
    `app_id`            BIGINT       NOT NULL COMMENT '应用ID',
    `app_code`          VARCHAR(50)  NOT NULL COMMENT '应用编码',
    `app_name`          VARCHAR(100) NOT NULL COMMENT '应用名称',
    `subscription_type` VARCHAR(20)  NOT NULL COMMENT '订阅类型: TRIAL/MONTHLY/YEARLY/PERPETUAL',
    `price`             DECIMAL(10,2) DEFAULT 0.00 COMMENT '订阅价格',
    `user_count`        INT          DEFAULT 1 COMMENT '购买用户数',
    `start_time`        DATETIME     NOT NULL COMMENT '生效时间',
    `end_time`          DATETIME     DEFAULT NULL COMMENT '到期时间',
    `status`            VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE' COMMENT '状态: TRIAL/ACTIVE/EXPIRED/CANCELED',
    `auto_renew`        TINYINT      DEFAULT 0 COMMENT '是否自动续费',
    `order_id`          BIGINT       DEFAULT NULL COMMENT '关联订单ID',
    `remark`            VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `created_by`        VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    `create_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP,
    `update_time`       DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `delete_flag`       TINYINT      DEFAULT 0,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_subscription_no` (`subscription_no`),
    KEY `idx_tenant_id` (`tenant_id`),
    KEY `idx_app_id` (`app_id`),
    KEY `idx_status` (`status`),
    KEY `idx_end_time` (`end_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='租户应用订阅';

-- ---------- 缺失表：t_user_permission_override（按实体生成） ----------
CREATE TABLE IF NOT EXISTS `t_user_permission_override` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` VARCHAR(64) DEFAULT NULL,
  `permission_id` BIGINT DEFAULT NULL,
  `override_type` VARCHAR(255) DEFAULT NULL,
  `tenant_id` BIGINT DEFAULT NULL,
  `create_time` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------- 缺失表：t_wage_payment（复用仓库既有定义） ----------
CREATE TABLE IF NOT EXISTS t_wage_payment (
    id VARCHAR(64) PRIMARY KEY,
    payment_no VARCHAR(64),
    biz_type VARCHAR(32),
    biz_id VARCHAR(64),
    amount DECIMAL(15,2),
    status VARCHAR(32),
    payment_method VARCHAR(32),
    proof_url VARCHAR(255),
    payment_remark VARCHAR(500),
    account_id VARCHAR(64),
    tenant_id BIGINT DEFAULT NULL,
    delete_flag INT DEFAULT 0,
    create_time TIMESTAMP DEFAULT NULL,
    update_time TIMESTAMP DEFAULT NULL
);
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='id');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payment_no');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payment_no` VARCHAR(50)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payee_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payee_type` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payee_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payee_id` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payee_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payee_name` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payment_account_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payment_account_id` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payment_method');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payment_method` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='amount');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `amount` DECIMAL(12,2)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='currency');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `currency` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='biz_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `biz_type` VARCHAR(30)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='biz_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `biz_id` VARCHAR(64)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='biz_no');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `biz_no` VARCHAR(64)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='status');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `status` VARCHAR(20)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payment_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payment_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payment_proof');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payment_proof` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='payment_remark');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `payment_remark` TEXT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='third_party_order_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `third_party_order_id` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='third_party_status');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `third_party_status` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='operator_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `operator_id` VARCHAR(32)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='operator_name');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `operator_name` VARCHAR(100)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='confirm_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `confirm_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='confirm_by');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `confirm_by` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='notify_status');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `notify_status` VARCHAR(255)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='notify_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `notify_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `tenant_id` BIGINT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='create_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `create_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='update_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `update_time` DATETIME', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_wage_payment' AND COLUMN_NAME='version');
SET @s = IF(@c=0, 'ALTER TABLE `t_wage_payment` ADD COLUMN `version` INT', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_skill_template ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='disclosure_level');
SET @s = IF(@c=0, 'ALTER TABLE `t_skill_template` ADD COLUMN `disclosure_level` VARCHAR(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='metadata_yaml');
SET @s = IF(@c=0, 'ALTER TABLE `t_skill_template` ADD COLUMN `metadata_yaml` TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='references_json');
SET @s = IF(@c=0, 'ALTER TABLE `t_skill_template` ADD COLUMN `references_json` TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='skill_md');
SET @s = IF(@c=0, 'ALTER TABLE `t_skill_template` ADD COLUMN `skill_md` VARCHAR(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='token_budget_metadata');
SET @s = IF(@c=0, 'ALTER TABLE `t_skill_template` ADD COLUMN `token_budget_metadata` INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_skill_template' AND COLUMN_NAME='token_budget_skill_md');
SET @s = IF(@c=0, 'ALTER TABLE `t_skill_template` ADD COLUMN `token_budget_skill_md` INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_ec_purchase_suggestion ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='ai_confidence');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_purchase_suggestion` ADD COLUMN `ai_confidence` INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='ai_reason');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_purchase_suggestion` ADD COLUMN `ai_reason` TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='production_order_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_purchase_suggestion` ADD COLUMN `production_order_id` VARCHAR(36) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_purchase_suggestion' AND COLUMN_NAME='suggestion_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_purchase_suggestion` ADD COLUMN `suggestion_type` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_ec_order_split ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_order_split' AND COLUMN_NAME='split_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_order_split` ADD COLUMN `split_type` VARCHAR(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_ecommerce_order ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ecommerce_order' AND COLUMN_NAME='distributor_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_ecommerce_order` ADD COLUMN `distributor_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ecommerce_order' AND COLUMN_NAME='is_presale');
SET @s = IF(@c=0, 'ALTER TABLE `t_ecommerce_order` ADD COLUMN `is_presale` INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ecommerce_order' AND COLUMN_NAME='order_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_ecommerce_order` ADD COLUMN `order_type` VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ecommerce_order' AND COLUMN_NAME='presale_remark');
SET @s = IF(@c=0, 'ALTER TABLE `t_ecommerce_order` ADD COLUMN `presale_remark` TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_ec_warehouse_allocation ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_warehouse_allocation' AND COLUMN_NAME='estimated_days');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_warehouse_allocation` ADD COLUMN `estimated_days` INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_warehouse_allocation' AND COLUMN_NAME='reason');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_warehouse_allocation` ADD COLUMN `reason` TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_ec_warehouse_allocation' AND COLUMN_NAME='score');
SET @s = IF(@c=0, 'ALTER TABLE `t_ec_warehouse_allocation` ADD COLUMN `score` DOUBLE DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_shop_config ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shop_config' AND COLUMN_NAME='promise_authentic');
SET @s = IF(@c=0, 'ALTER TABLE `t_shop_config` ADD COLUMN `promise_authentic` TINYINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shop_config' AND COLUMN_NAME='promise_extra');
SET @s = IF(@c=0, 'ALTER TABLE `t_shop_config` ADD COLUMN `promise_extra` VARCHAR(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shop_config' AND COLUMN_NAME='promise_in_stock');
SET @s = IF(@c=0, 'ALTER TABLE `t_shop_config` ADD COLUMN `promise_in_stock` TINYINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shop_config' AND COLUMN_NAME='return_days');
SET @s = IF(@c=0, 'ALTER TABLE `t_shop_config` ADD COLUMN `return_days` INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_template_operation_log ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_template_operation_log' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_template_operation_log` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_style_operation_log ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_operation_log' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_operation_log` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_style_bom ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_bom` ADD COLUMN `assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_bom` ADD COLUMN `completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_bom` ADD COLUMN `start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='supplier_contact_person');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_bom` ADD COLUMN `supplier_contact_person` VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='supplier_contact_phone');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_bom` ADD COLUMN `supplier_contact_phone` VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='supplier_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_bom` ADD COLUMN `supplier_id` VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_bom' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_bom` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_style_size ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size' AND COLUMN_NAME='assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size` ADD COLUMN `assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size' AND COLUMN_NAME='completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size` ADD COLUMN `completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size' AND COLUMN_NAME='start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size` ADD COLUMN `start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_size' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_size` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_style_process ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_process' AND COLUMN_NAME='assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_process` ADD COLUMN `assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_process' AND COLUMN_NAME='completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_process` ADD COLUMN `completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_process' AND COLUMN_NAME='progress_stage');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_process` ADD COLUMN `progress_stage` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_process' AND COLUMN_NAME='start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_process` ADD COLUMN `start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_style_info ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='bom_assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `bom_assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='bom_completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `bom_completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='bom_start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `bom_start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pattern_assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `pattern_assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='pattern_start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `pattern_start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='process_assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `process_assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='process_completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `process_completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='process_start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `process_start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='production_assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `production_assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='production_completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `production_completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='production_start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `production_start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='sample_quantity');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `sample_quantity` INT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='secondary_assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `secondary_assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='secondary_completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `secondary_completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='secondary_start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `secondary_start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='size_assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `size_assignee` VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='size_completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `size_completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='size_price_assignee');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `size_price_assignee` VARCHAR(255) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='size_price_completed_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `size_price_completed_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='size_price_start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `size_price_start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='size_start_time');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `size_start_time` DATETIME DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_info' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_style_info` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_operation_log ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_operation_log' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_operation_log` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_factory ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='factory_type');
SET @s = IF(@c=0, 'ALTER TABLE `t_factory` ADD COLUMN `factory_type` VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_role ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_role' AND COLUMN_NAME='data_scope');
SET @s = IF(@c=0, 'ALTER TABLE `t_role` ADD COLUMN `data_scope` VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_pattern_production ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_production' AND COLUMN_NAME='remarks');
SET @s = IF(@c=0, 'ALTER TABLE `t_pattern_production` ADD COLUMN `remarks` VARCHAR(500) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_pattern_production' AND COLUMN_NAME='review_images');
SET @s = IF(@c=0, 'ALTER TABLE `t_pattern_production` ADD COLUMN `review_images` TEXT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_material_roll ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_roll' AND COLUMN_NAME='cutting_usage_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_roll` ADD COLUMN `cutting_usage_id` VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_roll' AND COLUMN_NAME='used_quantity');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_roll` ADD COLUMN `used_quantity` DECIMAL(14,4) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 补列：t_material_reconciliation ----------
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_reconciliation' AND COLUMN_NAME='supplier_contact_person');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_reconciliation` ADD COLUMN `supplier_contact_person` VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_reconciliation' AND COLUMN_NAME='supplier_contact_phone');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_reconciliation` ADD COLUMN `supplier_contact_phone` VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_reconciliation' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_material_reconciliation` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 登录/鉴权链路基础列（t_user / t_role） ----------
-- 这两列在部分历史库中被手工补过，但从未进入 Flyway；
-- 新库或缺列库登录会报 Unknown column 'tenant_id'。
SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_user' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_user` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT ''所属租户ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_user' AND COLUMN_NAME='is_tenant_owner');
SET @s = IF(@c=0, 'ALTER TABLE `t_user` ADD COLUMN `is_tenant_owner` TINYINT(1) DEFAULT 0 COMMENT ''是否租户主账号''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_role' AND COLUMN_NAME='tenant_id');
SET @s = IF(@c=0, 'ALTER TABLE `t_role` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT ''租户ID''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @c = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_role' AND COLUMN_NAME='sort_order');
SET @s = IF(@c=0, 'ALTER TABLE `t_role` ADD COLUMN `sort_order` INT DEFAULT 0 COMMENT ''排序''', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
