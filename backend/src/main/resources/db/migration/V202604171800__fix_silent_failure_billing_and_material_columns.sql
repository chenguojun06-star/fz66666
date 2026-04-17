-- ==================================================================
-- V202604171800: Silent Failure 防御补偿脚本
-- ==================================================================
-- 背景：
--   以下 Flyway 脚本使用了 SET @sql = IF(..., 'ALTER TABLE ... COMMENT ''text''...', 'SELECT 1')
--   模式，MySQL 8.x Flyway 解析器在部分环境下将第一个 '' 识别为字符串结束符，
--   导致 ALTER TABLE 语句被截断 → 列永远不被添加（Silent failure），但
--   flyway_schema_history 仍记录成功。
--
--   受影响脚本：
--     V20260222b__tenant_storage_billing.sql
--     V20260222c__billing_cycle.sql
--     V20260223d__billing_invoice_and_tenant_self_service.sql
--     V20260416002__add_disabled_to_material_database.sql
--
-- 本脚本采用安全模板（ALTER TABLE 语句完全不带 COMMENT），幂等补齐
-- 所有受影响列。本地已验证列存在时 SELECT 1 无副作用。
-- 参考：V202608051400__fix_production_order_skc.sql
-- ==================================================================

-- ── t_tenant 套餐与存储列 ──
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='plan_type')=0,
    'ALTER TABLE `t_tenant` ADD COLUMN `plan_type` VARCHAR(20) NOT NULL DEFAULT ''TRIAL''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='monthly_fee')=0,
    'ALTER TABLE `t_tenant` ADD COLUMN `monthly_fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='storage_quota_mb')=0,
    'ALTER TABLE `t_tenant` ADD COLUMN `storage_quota_mb` BIGINT NOT NULL DEFAULT 1024',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='storage_used_mb')=0,
    'ALTER TABLE `t_tenant` ADD COLUMN `storage_used_mb` BIGINT NOT NULL DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant' AND COLUMN_NAME='billing_cycle')=0,
    'ALTER TABLE `t_tenant` ADD COLUMN `billing_cycle` VARCHAR(10) NOT NULL DEFAULT ''MONTHLY''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── t_tenant_billing_record 计费/发票列 ──
-- 注意：若 t_tenant_billing_record 表本身不存在（V20260222b 建表段也失败的极端情况），
-- 此处跳过即可，不会报错（INFORMATION_SCHEMA 返回 0 → SELECT 1）。
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record')=1
            AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='billing_cycle')=0,
    'ALTER TABLE `t_tenant_billing_record` ADD COLUMN `billing_cycle` VARCHAR(10) NOT NULL DEFAULT ''MONTHLY''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record')=1
            AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_required')=0,
    'ALTER TABLE `t_tenant_billing_record` ADD COLUMN `invoice_required` TINYINT DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record')=1
            AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_status')=0,
    'ALTER TABLE `t_tenant_billing_record` ADD COLUMN `invoice_status` VARCHAR(20) DEFAULT ''NOT_REQUIRED''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record')=1
            AND (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant_billing_record' AND COLUMN_NAME='invoice_title')=0,
    'ALTER TABLE `t_tenant_billing_record` ADD COLUMN `invoice_title` VARCHAR(200) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ── t_material_database.disabled 停用标识 ──
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_database' AND COLUMN_NAME='disabled')=0,
    'ALTER TABLE `t_material_database` ADD COLUMN `disabled` INT DEFAULT 0',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
