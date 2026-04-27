-- 供应商管理增强：向 t_factory 添加供应商主数据、准入、合同、评级、绩效字段
-- 幂等写法 INFORMATION_SCHEMA（MySQL 8.0 不支持 IF NOT EXISTS）

-- supplier_category: 供应商分类: fabric/auxiliary/printing_embroidery/washing/packaging
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='supplier_category')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `supplier_category` VARCHAR(64) DEFAULT NULL AFTER `daily_capacity`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_region: 供应商区域
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='supplier_region')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `supplier_region` VARCHAR(64) DEFAULT NULL AFTER `supplier_category`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_tier: 供应商评级: S/A/B/C
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='supplier_tier')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `supplier_tier` VARCHAR(16) DEFAULT NULL AFTER `supplier_region`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- supplier_tier_updated_at: 评级更新时间
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='supplier_tier_updated_at')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `supplier_tier_updated_at` DATETIME DEFAULT NULL AFTER `supplier_tier`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- admission_status: 准入状态: pending/approved/probation/rejected/suspended
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='admission_status')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `admission_status` VARCHAR(32) DEFAULT NULL AFTER `supplier_tier_updated_at`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- admission_date: 准入通过日期
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='admission_date')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `admission_date` DATETIME DEFAULT NULL AFTER `admission_status`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- qualification_cert: 资质证书JSON(多张图片URL)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='qualification_cert')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `qualification_cert` TEXT DEFAULT NULL AFTER `admission_date`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contract_no: 合同编号
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='contract_no')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `contract_no` VARCHAR(64) DEFAULT NULL AFTER `qualification_cert`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contract_start_date: 合同开始日期
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='contract_start_date')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `contract_start_date` DATETIME DEFAULT NULL AFTER `contract_no`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contract_end_date: 合同结束日期
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='contract_end_date')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `contract_end_date` DATETIME DEFAULT NULL AFTER `contract_start_date`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contract_amount: 合同金额
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='contract_amount')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `contract_amount` DECIMAL(15,2) DEFAULT NULL AFTER `contract_end_date`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- contract_terms: 合同条款摘要
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='contract_terms')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `contract_terms` TEXT DEFAULT NULL AFTER `contract_amount`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bank_name: 开户银行
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='bank_name')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `bank_name` VARCHAR(128) DEFAULT NULL AFTER `contract_terms`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bank_account: 银行账号
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='bank_account')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `bank_account` VARCHAR(64) DEFAULT NULL AFTER `bank_name`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- bank_branch: 开户支行
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='bank_branch')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `bank_branch` VARCHAR(128) DEFAULT NULL AFTER `bank_account`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- on_time_delivery_rate: 准时交货率(%)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='on_time_delivery_rate')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `on_time_delivery_rate` DECIMAL(5,2) DEFAULT NULL AFTER `bank_branch`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- quality_score: 质量评分(0-100)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='quality_score')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `quality_score` DECIMAL(5,2) DEFAULT NULL AFTER `on_time_delivery_rate`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completion_rate: 订单完成率(%)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='completion_rate')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `completion_rate` DECIMAL(5,2) DEFAULT NULL AFTER `quality_score`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- overall_score: 综合评分(0-100)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='overall_score')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `overall_score` DECIMAL(5,2) DEFAULT NULL AFTER `completion_rate`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- total_orders: 总订单数
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='total_orders')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `total_orders` INT DEFAULT 0 AFTER `overall_score`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- completed_orders: 已完成订单数
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='completed_orders')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `completed_orders` INT DEFAULT 0 AFTER `total_orders`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- overdue_orders: 延期订单数
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_factory' AND COLUMN_NAME='overdue_orders')=0,
    'ALTER TABLE `t_factory` ADD COLUMN `overdue_orders` INT DEFAULT 0 AFTER `completed_orders`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

