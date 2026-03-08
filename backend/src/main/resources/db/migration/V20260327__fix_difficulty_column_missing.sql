-- V20260327: 补加 t_style_process.difficulty 列
-- 原因：V20260326 PREPARE/EXECUTE 在部分环境未实际执行 ALTER TABLE
-- 幂等写法：列已存在则执行 SELECT 1，不报错
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_style_process'
     AND COLUMN_NAME = 'difficulty') = 0,
  'ALTER TABLE t_style_process ADD COLUMN difficulty VARCHAR(10) DEFAULT NULL AFTER machine_type',
  'SELECT 1'
);
PREPARE fix_stmt FROM @ddl;
EXECUTE fix_stmt;
DEALLOCATE PREPARE fix_stmt;
