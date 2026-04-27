-- 补偿脚本：修复 V202704271316 中 COMMENT ''xxx'' Silent failure
-- 原因：SET @s = IF 块内使用 COMMENT ''xxx'' 导致 Flyway SQL 解析器截断语句，列从未实际添加
-- t_material_picking（8列）和 t_material_picking_item（5列）全部未在云端创建
-- 永久规律：SET @s 块内禁止使用 COMMENT（写在 .sql 文件注释中即可）

-- t_material_picking: 关联采购单ID
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='purchase_id')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `purchase_id` VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking: 审核状态
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='audit_status')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `audit_status` VARCHAR(32) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking: 审核人ID
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='auditor_id')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `auditor_id` VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking: 审核人姓名
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='auditor_name')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `auditor_name` VARCHAR(128) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking: 审核时间
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='audit_time')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `audit_time` DATETIME DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking: 审核备注
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='audit_remark')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `audit_remark` VARCHAR(500) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking: 财务状态
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='finance_status')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `finance_status` VARCHAR(32) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking: 财务备注
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking' AND COLUMN_NAME='finance_remark')=0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `finance_remark` VARCHAR(500) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking_item: 规格
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='specification')=0,
  'ALTER TABLE `t_material_picking_item` ADD COLUMN `specification` VARCHAR(200) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking_item: 单价
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='unit_price')=0,
  'ALTER TABLE `t_material_picking_item` ADD COLUMN `unit_price` DECIMAL(12,2) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking_item: 供应商名称
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='supplier_name')=0,
  'ALTER TABLE `t_material_picking_item` ADD COLUMN `supplier_name` VARCHAR(200) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking_item: 仓库位置
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='warehouse_location')=0,
  'ALTER TABLE `t_material_picking_item` ADD COLUMN `warehouse_location` VARCHAR(200) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- t_material_picking_item: 物料类型
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_picking_item' AND COLUMN_NAME='material_type')=0,
  'ALTER TABLE `t_material_picking_item` ADD COLUMN `material_type` VARCHAR(50) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
