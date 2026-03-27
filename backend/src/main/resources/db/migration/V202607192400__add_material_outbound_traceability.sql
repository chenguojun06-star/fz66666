SET @s1 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'outbound_no') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `outbound_no` VARCHAR(64) DEFAULT NULL AFTER `stock_id`',
  'SELECT 1'
);
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @s2 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'source_type') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `source_type` VARCHAR(32) DEFAULT NULL AFTER `outbound_no`',
  'SELECT 1'
);
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @s3 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'pickup_type') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `pickup_type` VARCHAR(20) DEFAULT NULL AFTER `source_type`',
  'SELECT 1'
);
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

SET @s4 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'usage_type') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `usage_type` VARCHAR(20) DEFAULT NULL AFTER `pickup_type`',
  'SELECT 1'
);
PREPARE stmt4 FROM @s4; EXECUTE stmt4; DEALLOCATE PREPARE stmt4;

SET @s5 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'order_id') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `order_id` VARCHAR(64) DEFAULT NULL AFTER `usage_type`',
  'SELECT 1'
);
PREPARE stmt5 FROM @s5; EXECUTE stmt5; DEALLOCATE PREPARE stmt5;

SET @s6 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'order_no') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `order_no` VARCHAR(100) DEFAULT NULL AFTER `order_id`',
  'SELECT 1'
);
PREPARE stmt6 FROM @s6; EXECUTE stmt6; DEALLOCATE PREPARE stmt6;

SET @s7 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'style_id') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `style_id` VARCHAR(64) DEFAULT NULL AFTER `order_no`',
  'SELECT 1'
);
PREPARE stmt7 FROM @s7; EXECUTE stmt7; DEALLOCATE PREPARE stmt7;

SET @s8 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'style_no') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `style_no` VARCHAR(100) DEFAULT NULL AFTER `style_id`',
  'SELECT 1'
);
PREPARE stmt8 FROM @s8; EXECUTE stmt8; DEALLOCATE PREPARE stmt8;

SET @s9 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'picking_id') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `picking_id` VARCHAR(64) DEFAULT NULL AFTER `style_no`',
  'SELECT 1'
);
PREPARE stmt9 FROM @s9; EXECUTE stmt9; DEALLOCATE PREPARE stmt9;

SET @s10 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'picking_no') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `picking_no` VARCHAR(100) DEFAULT NULL AFTER `picking_id`',
  'SELECT 1'
);
PREPARE stmt10 FROM @s10; EXECUTE stmt10; DEALLOCATE PREPARE stmt10;

SET @s11 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'receiver_id') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `receiver_id` VARCHAR(64) DEFAULT NULL AFTER `operator_name`',
  'SELECT 1'
);
PREPARE stmt11 FROM @s11; EXECUTE stmt11; DEALLOCATE PREPARE stmt11;

SET @s12 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'receiver_name') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `receiver_name` VARCHAR(100) DEFAULT NULL AFTER `receiver_id`',
  'SELECT 1'
);
PREPARE stmt12 FROM @s12; EXECUTE stmt12; DEALLOCATE PREPARE stmt12;

SET @s13 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'movement_type') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `movement_type` VARCHAR(20) DEFAULT ''OUTBOUND'' AFTER `pickup_type`',
  'SELECT 1'
);
PREPARE stmt13 FROM @s13; EXECUTE stmt13; DEALLOCATE PREPARE stmt13;

SET @s14 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'source_type') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `source_type` VARCHAR(32) DEFAULT NULL AFTER `movement_type`',
  'SELECT 1'
);
PREPARE stmt14 FROM @s14; EXECUTE stmt14; DEALLOCATE PREPARE stmt14;

SET @s15 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'usage_type') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `usage_type` VARCHAR(20) DEFAULT NULL AFTER `source_type`',
  'SELECT 1'
);
PREPARE stmt15 FROM @s15; EXECUTE stmt15; DEALLOCATE PREPARE stmt15;

SET @s16 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'source_record_id') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `source_record_id` VARCHAR(64) DEFAULT NULL AFTER `usage_type`',
  'SELECT 1'
);
PREPARE stmt16 FROM @s16; EXECUTE stmt16; DEALLOCATE PREPARE stmt16;

SET @s17 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'source_document_no') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `source_document_no` VARCHAR(100) DEFAULT NULL AFTER `source_record_id`',
  'SELECT 1'
);
PREPARE stmt17 FROM @s17; EXECUTE stmt17; DEALLOCATE PREPARE stmt17;

SET @s18 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'receiver_id') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receiver_id` VARCHAR(64) DEFAULT NULL AFTER `pickup_time`',
  'SELECT 1'
);
PREPARE stmt18 FROM @s18; EXECUTE stmt18; DEALLOCATE PREPARE stmt18;

SET @s19 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'receiver_name') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `receiver_name` VARCHAR(100) DEFAULT NULL AFTER `receiver_id`',
  'SELECT 1'
);
PREPARE stmt19 FROM @s19; EXECUTE stmt19; DEALLOCATE PREPARE stmt19;

SET @s20 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'issuer_id') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `issuer_id` VARCHAR(64) DEFAULT NULL AFTER `receiver_name`',
  'SELECT 1'
);
PREPARE stmt20 FROM @s20; EXECUTE stmt20; DEALLOCATE PREPARE stmt20;

SET @s21 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'issuer_name') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `issuer_name` VARCHAR(100) DEFAULT NULL AFTER `issuer_id`',
  'SELECT 1'
);
PREPARE stmt21 FROM @s21; EXECUTE stmt21; DEALLOCATE PREPARE stmt21;

SET @s22 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'warehouse_location') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `warehouse_location` VARCHAR(200) DEFAULT NULL AFTER `issuer_name`',
  'SELECT 1'
);
PREPARE stmt22 FROM @s22; EXECUTE stmt22; DEALLOCATE PREPARE stmt22;

SET @s23 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_picking'
     AND COLUMN_NAME = 'pickup_type') = 0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `pickup_type` VARCHAR(20) DEFAULT NULL AFTER `picker_name`',
  'SELECT 1'
);
PREPARE stmt23 FROM @s23; EXECUTE stmt23; DEALLOCATE PREPARE stmt23;

SET @s24 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_picking'
     AND COLUMN_NAME = 'usage_type') = 0,
  'ALTER TABLE `t_material_picking` ADD COLUMN `usage_type` VARCHAR(20) DEFAULT NULL AFTER `pickup_type`',
  'SELECT 1'
);
PREPARE stmt24 FROM @s24; EXECUTE stmt24; DEALLOCATE PREPARE stmt24;

SET @s25 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'factory_id') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `factory_id` VARCHAR(64) DEFAULT NULL AFTER `style_no`',
  'SELECT 1'
);
PREPARE stmt25 FROM @s25; EXECUTE stmt25; DEALLOCATE PREPARE stmt25;

SET @s26 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'factory_name') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `factory_name` VARCHAR(100) DEFAULT NULL AFTER `factory_id`',
  'SELECT 1'
);
PREPARE stmt26 FROM @s26; EXECUTE stmt26; DEALLOCATE PREPARE stmt26;

SET @s27 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_outbound_log'
     AND COLUMN_NAME = 'factory_type') = 0,
  'ALTER TABLE `t_material_outbound_log` ADD COLUMN `factory_type` VARCHAR(20) DEFAULT NULL AFTER `factory_name`',
  'SELECT 1'
);
PREPARE stmt27 FROM @s27; EXECUTE stmt27; DEALLOCATE PREPARE stmt27;

SET @s28 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'factory_id') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `factory_id` VARCHAR(64) DEFAULT NULL AFTER `remark`',
  'SELECT 1'
);
PREPARE stmt28 FROM @s28; EXECUTE stmt28; DEALLOCATE PREPARE stmt28;

SET @s29 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'factory_name') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `factory_name` VARCHAR(100) DEFAULT NULL AFTER `factory_id`',
  'SELECT 1'
);
PREPARE stmt29 FROM @s29; EXECUTE stmt29; DEALLOCATE PREPARE stmt29;

SET @s30 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_material_pickup_record'
     AND COLUMN_NAME = 'factory_type') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `factory_type` VARCHAR(20) DEFAULT NULL AFTER `factory_name`',
  'SELECT 1'
);
PREPARE stmt30 FROM @s30; EXECUTE stmt30; DEALLOCATE PREPARE stmt30;
