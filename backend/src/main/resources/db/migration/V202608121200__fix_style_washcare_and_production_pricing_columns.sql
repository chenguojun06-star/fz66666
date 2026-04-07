-- =====================================================================
-- V202608121200: 修复 t_style_info 洗水唛8列 + t_production_order 定价5列
-- 根本原因: V20260427002 / V20260428001 / V20260327001 使用了 COMMENT ''text''
--   写法，Flyway SQL 解析器将第一个 '' 识别为字符串结束符导致
--   ALTER TABLE 语句被截断，列从未实际添加（Silent failure）。
-- 永久规律: SET @s 字符串内禁止写 COMMENT，注释请写在 .sql 文件行注释里。
-- =====================================================================

-- =====================================================================
-- 第一部分：t_style_info 洗水唛字段（来自 V20260427002 COMMENT '' bug）
-- fabric_composition: 面料成分，如 70%棉 30%涤纶
-- wash_instructions: 洗涤说明，如 30°C水洗，不可漂白
-- u_code: U编码/品质追溯码，用于吊牌打印
-- =====================================================================

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'fabric_composition') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'wash_instructions') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `wash_instructions` VARCHAR(500) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'u_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `u_code` VARCHAR(100) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- 第二部分：t_style_info ISO3758 护理代码字段（来自 V20260428001 COMMENT '' bug）
-- wash_temp_code : W30/W40/W60/W95/HAND/NO
-- bleach_code    : ANY/NON_CHL/NO
-- tumble_dry_code: NORMAL/LOW/NO
-- iron_code      : LOW/MED/HIGH/NO
-- dry_clean_code : YES/NO
-- =====================================================================

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'wash_temp_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `wash_temp_code` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'bleach_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `bleach_code` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'tumble_dry_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `tumble_dry_code` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'iron_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `iron_code` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_style_info'
       AND COLUMN_NAME  = 'dry_clean_code') = 0,
    'ALTER TABLE `t_style_info` ADD COLUMN `dry_clean_code` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- 第三部分：t_production_order 定价快照字段（来自 V20260327001 COMMENT '' bug）
-- factory_unit_price: 下单锁定单价（元/件）
-- pricing_mode: 下单单价模式 PROCESS/SIZE/MANUAL
-- scatter_pricing_mode: 散剪单价模式 FOLLOW_ORDER/MANUAL
-- scatter_cutting_unit_price: 散剪单价快照（元/件）
-- =====================================================================

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'factory_unit_price') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `factory_unit_price` DECIMAL(10,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'pricing_mode') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `pricing_mode` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'scatter_pricing_mode') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `scatter_pricing_mode` VARCHAR(20) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'scatter_cutting_unit_price') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `scatter_cutting_unit_price` DECIMAL(10,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================================
-- 第四部分：t_production_order.material_arrival_rate（从未写入 Flyway）
-- material_arrival_rate: 面料到货率（0-100 整数百分比）
-- =====================================================================

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_production_order'
       AND COLUMN_NAME  = 'material_arrival_rate') = 0,
    'ALTER TABLE `t_production_order` ADD COLUMN `material_arrival_rate` INT DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
