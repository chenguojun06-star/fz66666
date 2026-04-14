-- ============================================================================
-- 补偿脚本：修复 t_material_purchase 9个因 COMMENT '' Flyway截断而缺失的列
-- 根因：原脚本 V20260325005 / V20260504001 / V20260507002 / V20260509001 / V202607191600
--       在 SET @s = IF(...) 内使用了 COMMENT ''xxx'' 写法，Flyway SQL 解析器将
--       第一个 '' 识别为字符串结束符 → ALTER TABLE 被截断 → 列从未创建（Silent failure）
-- 本脚本：无 COMMENT，纯幂等 INFORMATION_SCHEMA 判断 + ALTER TABLE
-- ============================================================================

-- 1. conversion_rate（米重换算值）— 原 V20260325005 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='conversion_rate')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `conversion_rate` DECIMAL(10,4) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. evidence_image_urls（回料确认凭证图片URLs）— 原 V20260504001 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='evidence_image_urls')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `evidence_image_urls` TEXT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. fabric_composition（面料成分）— 原 V20260507002 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='fabric_composition')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `fabric_composition` VARCHAR(500) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. invoice_urls（发票/单据图片URL列表）— 原 V20260509001 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='invoice_urls')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `invoice_urls` TEXT DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. audit_status（初审状态）— 原 V202607191600 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_status')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_status` VARCHAR(32) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. audit_reason（初审驳回原因）— 原 V202607191600 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_reason')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_reason` VARCHAR(500) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 7. audit_time（初审操作时间）— 原 V202607191600 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_time')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_time` DATETIME DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 8. audit_operator_id（初审操作人ID）— 原 V202607191600 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_operator_id')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_operator_id` VARCHAR(64) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 9. audit_operator_name（初审操作人姓名）— 原 V202607191600 被截断
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_material_purchase' AND COLUMN_NAME='audit_operator_name')=0,
  'ALTER TABLE `t_material_purchase` ADD COLUMN `audit_operator_name` VARCHAR(100) DEFAULT NULL',
  'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
