-- 云端采购/生产采购 500 紧急补库脚本（2026-03-18）
-- 适用症状：
-- 1. GET /api/production/purchase/list?myTasks=true 返回“数据库操作异常，请联系管理员”
-- 2. GET /api/production/purchase/list?page=... 返回 500
-- 3. GET /api/production/purchase/stats 返回 500
-- 4. POST /api/procurement/purchase-orders/list 返回 500
-- 5. POST /api/procurement/stats 返回 500
--
-- 根因：云端 t_material_purchase / t_factory 表结构落后于当前代码实体映射。
-- 说明：生产环境已禁用 DataInitializer，仅靠 Flyway；若历史迁移未完整执行，采购相关接口会因缺列直接报 BadSqlGrammarException。
-- 2026-03-18 二次核实：若执行“只返回缺失字段”查询后仅返回 evidence_image_urls，
-- 请直接在云端控制台执行下面这条，不要继续使用 PREPARE/EXECUTE 动态 SQL：
-- ALTER TABLE `t_material_purchase`
--   ADD COLUMN `evidence_image_urls` TEXT DEFAULT NULL COMMENT '回料确认凭证图片URLs';
-- 云端 SQL 控制台对多段 PREPARE/EXECUTE 支持不稳定，容易把已定位问题继续拖长。

SELECT 'step-1: verify t_material_purchase columns' AS step;

SELECT
  expected.column_name,
  CASE WHEN actual.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(actual.COLUMN_TYPE, '') AS actual_type
FROM (
  SELECT 1 AS sort_order, 'tenant_id' AS column_name
  UNION ALL SELECT 2, 'inbound_record_id'
  UNION ALL SELECT 3, 'supplier_contact_person'
  UNION ALL SELECT 4, 'supplier_contact_phone'
  UNION ALL SELECT 5, 'color'
  UNION ALL SELECT 6, 'size'
  UNION ALL SELECT 7, 'return_confirmed'
  UNION ALL SELECT 8, 'return_quantity'
  UNION ALL SELECT 9, 'return_confirmer_id'
  UNION ALL SELECT 10, 'return_confirmer_name'
  UNION ALL SELECT 11, 'return_confirm_time'
  UNION ALL SELECT 12, 'creator_id'
  UNION ALL SELECT 13, 'creator_name'
  UNION ALL SELECT 14, 'updater_id'
  UNION ALL SELECT 15, 'updater_name'
  UNION ALL SELECT 16, 'expected_arrival_date'
  UNION ALL SELECT 17, 'actual_arrival_date'
  UNION ALL SELECT 18, 'expected_ship_date'
  UNION ALL SELECT 19, 'source_type'
  UNION ALL SELECT 20, 'pattern_production_id'
  UNION ALL SELECT 21, 'evidence_image_urls'
  UNION ALL SELECT 22, 'fabric_composition'
) expected
LEFT JOIN INFORMATION_SCHEMA.COLUMNS actual
  ON actual.TABLE_SCHEMA = DATABASE()
 AND actual.TABLE_NAME = 't_material_purchase'
 AND actual.COLUMN_NAME = expected.column_name
ORDER BY expected.sort_order;

SELECT 'step-2: verify t_factory supplier_type' AS step;

SELECT
  CASE WHEN COUNT(*) = 0 THEN 'MISSING' ELSE 'OK' END AS status,
  COALESCE(MAX(COLUMN_TYPE), '') AS actual_type
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_factory'
  AND COLUMN_NAME = 'supplier_type';

SELECT 'step-3: direct probe high-risk columns' AS step;

SELECT `fabric_composition` FROM `t_material_purchase` LIMIT 1;

SELECT `supplier_type` FROM `t_factory` LIMIT 1;

SELECT 'step-4: patch t_material_purchase missing columns' AS step;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'tenant_id') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `tenant_id` BIGINT DEFAULT NULL COMMENT ''租户ID''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'inbound_record_id') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `inbound_record_id` VARCHAR(36) DEFAULT NULL COMMENT ''入库记录ID''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'supplier_contact_person') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `supplier_contact_person` VARCHAR(50) DEFAULT NULL COMMENT ''供应商联系人''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'supplier_contact_phone') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `supplier_contact_phone` VARCHAR(20) DEFAULT NULL COMMENT ''供应商联系电话''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'color') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `color` VARCHAR(50) DEFAULT NULL COMMENT ''颜色''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'size') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `size` VARCHAR(100) DEFAULT NULL COMMENT ''尺码''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'return_confirmed') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirmed` INT DEFAULT 0 COMMENT ''回料是否确认(0-否,1-是)''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'return_quantity') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `return_quantity` INT DEFAULT 0 COMMENT ''回料数量''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'return_confirmer_id') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirmer_id` VARCHAR(36) DEFAULT NULL COMMENT ''回料确认人ID''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'return_confirmer_name') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirmer_name` VARCHAR(100) DEFAULT NULL COMMENT ''回料确认人名称''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'return_confirm_time') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `return_confirm_time` DATETIME DEFAULT NULL COMMENT ''回料确认时间''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'creator_id') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `creator_id` VARCHAR(36) DEFAULT NULL COMMENT ''创建人ID''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'creator_name') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `creator_name` VARCHAR(50) DEFAULT NULL COMMENT ''创建人姓名''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'updater_id') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `updater_id` VARCHAR(36) DEFAULT NULL COMMENT ''更新人ID''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'updater_name') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `updater_name` VARCHAR(50) DEFAULT NULL COMMENT ''更新人姓名''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'expected_arrival_date') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `expected_arrival_date` DATETIME DEFAULT NULL COMMENT ''预计到货日期''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'actual_arrival_date') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `actual_arrival_date` DATETIME DEFAULT NULL COMMENT ''实际到货日期''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'expected_ship_date') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `expected_ship_date` DATE DEFAULT NULL COMMENT ''预计出货日期''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'source_type') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `source_type` VARCHAR(20) DEFAULT ''order'' COMMENT ''采购来源类型''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'pattern_production_id') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `pattern_production_id` VARCHAR(36) DEFAULT NULL COMMENT ''样衣生产ID''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'evidence_image_urls') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `evidence_image_urls` TEXT DEFAULT NULL COMMENT ''回料确认凭证图片URLs''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_material_purchase' AND COLUMN_NAME = 'fabric_composition') = 0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL COMMENT ''面料成分（从物料资料库同步）''',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'step-5: patch t_factory supplier_type' AS step;

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_factory' AND COLUMN_NAME = 'supplier_type') = 0,
  'ALTER TABLE `t_factory` ADD COLUMN `supplier_type` VARCHAR(20) DEFAULT NULL COMMENT ''供应商类型：MATERIAL-面辅料供应商，OUTSOURCE-外发厂'' AFTER `factory_type`',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'step-6: verify patched result' AS step;

SELECT COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_material_purchase'
  AND COLUMN_NAME IN (
    'tenant_id', 'inbound_record_id', 'supplier_contact_person', 'supplier_contact_phone',
    'color', 'size', 'return_confirmed', 'return_quantity', 'return_confirmer_id',
    'return_confirmer_name', 'return_confirm_time', 'creator_id', 'creator_name',
    'updater_id', 'updater_name', 'expected_arrival_date', 'actual_arrival_date',
    'expected_ship_date', 'source_type', 'pattern_production_id', 'evidence_image_urls',
    'fabric_composition'
  )
ORDER BY COLUMN_NAME;

SELECT COLUMN_NAME, COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 't_factory'
  AND COLUMN_NAME = 'supplier_type';
