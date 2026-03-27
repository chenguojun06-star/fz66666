SET @s1 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'receivable_id') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receivable_id` VARCHAR(64) DEFAULT NULL AFTER `finance_remark`',
  'SELECT 1'
);
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @s2 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'receivable_no') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receivable_no` VARCHAR(64) DEFAULT NULL AFTER `receivable_id`',
  'SELECT 1'
);
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @s3 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'receivable_status') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receivable_status` VARCHAR(20) DEFAULT NULL AFTER `receivable_no`',
  'SELECT 1'
);
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @s4 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'received_amount') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `received_amount` DECIMAL(18,2) DEFAULT NULL AFTER `receivable_status`',
  'SELECT 1'
);
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

SET @s5 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'received_time') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `received_time` DATETIME DEFAULT NULL AFTER `received_amount`',
  'SELECT 1'
);
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

SET @s6 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_receivable'
     AND COLUMN_NAME = 'source_biz_type') = 0,
  'ALTER TABLE `t_receivable` ADD COLUMN `source_biz_type` VARCHAR(32) DEFAULT NULL AFTER `description`',
  'SELECT 1'
);
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

SET @s7 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_receivable'
     AND COLUMN_NAME = 'source_biz_id') = 0,
  'ALTER TABLE `t_receivable` ADD COLUMN `source_biz_id` VARCHAR(64) DEFAULT NULL AFTER `source_biz_type`',
  'SELECT 1'
);
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

SET @s8 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_receivable'
     AND COLUMN_NAME = 'source_biz_no') = 0,
  'ALTER TABLE `t_receivable` ADD COLUMN `source_biz_no` VARCHAR(64) DEFAULT NULL AFTER `source_biz_id`',
  'SELECT 1'
);
PREPARE stmt8 FROM @s8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;
