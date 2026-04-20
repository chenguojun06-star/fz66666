-- 修复财务链路 schema 漂移：bill-aggregation / receivable / payment-center 高频缺列
-- 说明：
-- 1) 历史环境若跳过部分迁移，会导致 delete_flag 缺失，引发 list/stats where 子句报 Unknown column
-- 2) t_material_pickup_record 在旧建表路径中缺少收款中心所需列，payment-center/list 查询整实体时易 500
-- 3) 全部使用 INFORMATION_SCHEMA 幂等补列，不修改已执行脚本

-- t_bill_aggregation.delete_flag
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_bill_aggregation'
       AND COLUMN_NAME = 'delete_flag') = 0,
    'ALTER TABLE `t_bill_aggregation` ADD COLUMN `delete_flag` INT NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_receivable.delete_flag
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_receivable'
       AND COLUMN_NAME = 'delete_flag') = 0,
    'ALTER TABLE `t_receivable` ADD COLUMN `delete_flag` TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_shipment_reconciliation.delete_flag
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_shipment_reconciliation'
       AND COLUMN_NAME = 'delete_flag') = 0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `delete_flag` TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_pickup_record: 收款中心必需列补齐
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'movement_type') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `movement_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'source_type') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `source_type` VARCHAR(30) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'usage_type') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `usage_type` VARCHAR(30) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'source_record_id') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `source_record_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'source_document_no') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `source_document_no` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'receiver_id') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receiver_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'receiver_name') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receiver_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'issuer_id') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `issuer_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'issuer_name') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `issuer_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'warehouse_location') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `warehouse_location` VARCHAR(200) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'receivable_id') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receivable_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'receivable_no') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receivable_no` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'receivable_status') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receivable_status` VARCHAR(20) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'received_amount') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `received_amount` DECIMAL(14,2) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'received_time') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `received_time` DATETIME DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'factory_id') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `factory_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'factory_name') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `factory_name` VARCHAR(100) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 't_material_pickup_record'
       AND COLUMN_NAME = 'factory_type') = 0,
    'ALTER TABLE `t_material_pickup_record` ADD COLUMN `factory_type` VARCHAR(20) DEFAULT NULL',
    'SELECT 1'
);
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
