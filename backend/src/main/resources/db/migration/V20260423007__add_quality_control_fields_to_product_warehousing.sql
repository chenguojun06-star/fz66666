-- 质量管控增强：向 t_product_warehousing 添加IQC/IPQC/SPC/AQL字段
-- 幂等写法 INFORMATION_SCHEMA（MySQL 8.0 不支持 IF NOT EXISTS）

-- inspection_type: 检验类型: IQC/IPQC/FQC/OQC
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='inspection_type')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `inspection_type` VARCHAR(32) DEFAULT NULL AFTER `scan_mode`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- aql_level: AQL等级: 0.65/1.0/1.5/2.5/4.0/6.5
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='aql_level')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `aql_level` VARCHAR(16) DEFAULT NULL AFTER `inspection_type`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- sample_size: 抽样数量
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='sample_size')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `sample_size` INT DEFAULT NULL AFTER `aql_level`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- accept_number: 接收数(Ac)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='accept_number')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `accept_number` INT DEFAULT NULL AFTER `sample_size`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- reject_number: 拒收数(Re)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='reject_number')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `reject_number` INT DEFAULT NULL AFTER `accept_number`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- cpk: 过程能力指数Cpk
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='cpk')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `cpk` DECIMAL(5,2) DEFAULT NULL AFTER `reject_number`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ppk: 过程性能指数Ppk
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='ppk')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `ppk` DECIMAL(5,2) DEFAULT NULL AFTER `cpk`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- control_chart_type: 控制图类型: Xbar_R/Xbar_S/p/c
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='control_chart_type')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `control_chart_type` VARCHAR(16) DEFAULT NULL AFTER `ppk`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- control_chart_data: 控制图数据JSON
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='control_chart_data')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `control_chart_data` TEXT DEFAULT NULL AFTER `control_chart_type`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- defect_code: 缺陷代码(标准分类)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='defect_code')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `defect_code` VARCHAR(64) DEFAULT NULL AFTER `control_chart_data`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- defect_severity: 缺陷严重度: critical/major/minor
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='defect_severity')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `defect_severity` VARCHAR(16) DEFAULT NULL AFTER `defect_code`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- inspector_cert_no: 质检员证书编号
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_product_warehousing' AND COLUMN_NAME='inspector_cert_no')=0,
    'ALTER TABLE `t_product_warehousing` ADD COLUMN `inspector_cert_no` VARCHAR(64) DEFAULT NULL AFTER `defect_severity`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

