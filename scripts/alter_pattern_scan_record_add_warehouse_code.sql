-- 为样板扫码记录补充仓位字段（样衣入库/出库）
SET @exists := (
  SELECT COUNT(1)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_pattern_scan_record'
    AND COLUMN_NAME = 'warehouse_code'
);

SET @sql := IF(
  @exists = 0,
  'ALTER TABLE `t_pattern_scan_record` ADD COLUMN `warehouse_code` varchar(64) DEFAULT NULL COMMENT ''仓位编码（样衣入库/出库）'' AFTER `scan_time`',
  'SELECT ''warehouse_code already exists'''
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
