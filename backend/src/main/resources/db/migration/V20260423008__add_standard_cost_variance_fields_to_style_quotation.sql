-- 标准成本卡+差异分析：向 t_style_quotation 添加标准成本和差异字段
-- 幂等写法 INFORMATION_SCHEMA（MySQL 8.0 不支持 IF NOT EXISTS）

-- standard_material_cost: 标准物料成本(成本卡)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='standard_material_cost')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `standard_material_cost` DECIMAL(12,2) DEFAULT NULL AFTER `is_locked`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- standard_process_cost: 标准工序成本(成本卡)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='standard_process_cost')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `standard_process_cost` DECIMAL(12,2) DEFAULT NULL AFTER `standard_material_cost`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- standard_other_cost: 标准其他成本(成本卡)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='standard_other_cost')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `standard_other_cost` DECIMAL(12,2) DEFAULT NULL AFTER `standard_process_cost`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- material_variance: 物料成本差异(实际-标准)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='material_variance')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `material_variance` DECIMAL(12,2) DEFAULT NULL AFTER `standard_other_cost`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- process_variance: 工序成本差异(实际-标准)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='process_variance')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `process_variance` DECIMAL(12,2) DEFAULT NULL AFTER `material_variance`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- total_variance: 总成本差异(实际-标准)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='total_variance')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `total_variance` DECIMAL(12,2) DEFAULT NULL AFTER `process_variance`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- variance_rate: 差异率(%)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='variance_rate')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `variance_rate` DECIMAL(5,2) DEFAULT NULL AFTER `total_variance`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- overhead_allocation_rate: 间接费用分摊率(%)
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='overhead_allocation_rate')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `overhead_allocation_rate` DECIMAL(5,2) DEFAULT NULL AFTER `variance_rate`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- allocated_overhead_cost: 分摊间接费用
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_style_quotation' AND COLUMN_NAME='allocated_overhead_cost')=0,
    'ALTER TABLE `t_style_quotation` ADD COLUMN `allocated_overhead_cost` DECIMAL(12,2) DEFAULT NULL AFTER `overhead_allocation_rate`',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

