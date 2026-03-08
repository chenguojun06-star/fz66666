-- V20260325: 补齐 t_factory.manager_id / operation_remark 和 t_organization_unit.category / operation_remark
-- 使用 INFORMATION_SCHEMA 条件判断，保证幂等（MySQL 8.0 不支持 ADD COLUMN IF NOT EXISTS）

-- t_factory: manager_id
SET @s1 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'manager_id') = 0,
  'ALTER TABLE `t_factory` ADD COLUMN `manager_id` VARCHAR(64) NULL COMMENT ''负责人ID'' AFTER `parent_org_unit_name`',
  'SELECT 1'
);
PREPARE stmt FROM @s1; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_factory: operation_remark
SET @s2 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'operation_remark') = 0,
  'ALTER TABLE `t_factory` ADD COLUMN `operation_remark` VARCHAR(500) NULL COMMENT ''运营备注'' AFTER `daily_capacity`',
  'SELECT 1'
);
PREPARE stmt FROM @s2; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_organization_unit: category
SET @s3 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_organization_unit' AND COLUMN_NAME = 'category') = 0,
  'ALTER TABLE `t_organization_unit` ADD COLUMN `category` VARCHAR(64) NULL COMMENT ''分类'' AFTER `node_name`',
  'SELECT 1'
);
PREPARE stmt FROM @s3; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_organization_unit: operation_remark
SET @s4 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_organization_unit' AND COLUMN_NAME = 'operation_remark') = 0,
  'ALTER TABLE `t_organization_unit` ADD COLUMN `operation_remark` VARCHAR(500) NULL COMMENT ''备注'' AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @s4; EXECUTE stmt; DEALLOCATE PREPARE stmt;
