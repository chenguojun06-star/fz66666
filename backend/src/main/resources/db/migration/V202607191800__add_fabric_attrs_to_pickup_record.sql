-- V202607191800: 面辅料领取记录补齐面料属性字段（幅宽/克重/成分）
-- 与 t_material_stock/t_material_database 保持一致，幂等写法

SET @s1 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_material_pickup_record'
     AND COLUMN_NAME  = 'fabric_width') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `fabric_width` VARCHAR(50) DEFAULT NULL COMMENT ''幅宽'' AFTER `specification`',
  'SELECT 1'
);
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

SET @s2 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_material_pickup_record'
     AND COLUMN_NAME  = 'fabric_weight') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `fabric_weight` VARCHAR(50) DEFAULT NULL COMMENT ''克重'' AFTER `fabric_width`',
  'SELECT 1'
);
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

SET @s3 = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME   = 't_material_pickup_record'
     AND COLUMN_NAME  = 'fabric_composition') = 0,
  'ALTER TABLE `t_material_pickup_record` ADD COLUMN `fabric_composition` VARCHAR(200) DEFAULT NULL COMMENT ''成分'' AFTER `fabric_weight`',
  'SELECT 1'
);
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;
