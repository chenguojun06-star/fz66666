-- ============================================================
-- V202607191800 和 V202607192400 因 SET @s 内字符串字面量
-- (COMMENT ''幅宽'' / DEFAULT ''OUTBOUND'') 触发 Flyway 静默失败
-- 导致 t_material_pickup_record 缺失 16 列
-- 本脚本用安全模式(DEFAULT NULL)逐列幂等补偿
-- ============================================================

SET @dbname = DATABASE();

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='fabric_width');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN fabric_width VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='fabric_weight');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN fabric_weight VARCHAR(50) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='fabric_composition');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN fabric_composition VARCHAR(200) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='movement_type');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN movement_type VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='source_type');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN source_type VARCHAR(30) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='usage_type');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN usage_type VARCHAR(30) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='source_record_id');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN source_record_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='source_document_no');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN source_document_no VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='receiver_id');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN receiver_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='receiver_name');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN receiver_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='issuer_id');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN issuer_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='issuer_name');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN issuer_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='warehouse_location');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN warehouse_location VARCHAR(200) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='factory_id');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN factory_id VARCHAR(64) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='factory_name');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN factory_name VARCHAR(100) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@dbname AND TABLE_NAME='t_material_pickup_record' AND COLUMN_NAME='factory_type');
SET @s = IF(@col=0, 'ALTER TABLE t_material_pickup_record ADD COLUMN factory_type VARCHAR(20) DEFAULT NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;