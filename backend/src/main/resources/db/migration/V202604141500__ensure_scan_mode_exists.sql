-- 确保scan_mode字段存在（幂等）
SET @dbname = DATABASE();
SET @tablename = 't_product_warehousing';
SET @columnname = 'scan_mode';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = @dbname
    AND TABLE_NAME = @tablename
    AND COLUMN_NAME = @columnname
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' VARCHAR(20) DEFAULT NULL COMMENT \'扫码模式：quick=快速入库,scan=扫码入库\' AFTER remark')
));
PREPARE stmt FROM @preparedStatement;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
