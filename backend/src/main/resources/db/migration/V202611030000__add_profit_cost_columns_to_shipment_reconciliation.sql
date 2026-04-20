-- ================================================================
-- 修复 t_shipment_reconciliation 缺少利润/成本计算列
-- 根因：这 5 列在本地通过手动 ALTER TABLE 添加，未写 Flyway 脚本 → 云端缺列
-- 修复错误：前端"数据库操作异常"（MyBatis-Plus SELECT * 报 Unknown column）
-- 字段说明：scan_cost=工序成本, material_cost=物料成本, total_cost=合计成本,
--           profit_amount=利润金额, profit_margin=利润率(%)
-- ================================================================

-- scan_cost: 工序扫码成本（由 ShipmentReconciliationOrchestrator.fillProfitInfo 实时计算回填）
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='scan_cost')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `scan_cost` DECIMAL(15,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- material_cost: 物料成本
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='material_cost')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `material_cost` DECIMAL(15,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- total_cost: 总成本 = 工序成本 + 物料成本
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='total_cost')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `total_cost` DECIMAL(15,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- profit_amount: 利润金额 = final_amount - total_cost
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='profit_amount')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `profit_amount` DECIMAL(15,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- profit_margin: 利润率(%) = profit_amount / final_amount * 100
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_shipment_reconciliation' AND COLUMN_NAME='profit_margin')=0,
    'ALTER TABLE `t_shipment_reconciliation` ADD COLUMN `profit_margin` DECIMAL(5,2) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
