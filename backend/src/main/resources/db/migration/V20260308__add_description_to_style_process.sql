-- V20260308: 为 t_style_process 添加制作描述列
-- 幂等写法：列已存在则执行 SELECT 1，不报错
SET @ddl = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 't_style_process'
     AND COLUMN_NAME = 'description') = 0,
  'ALTER TABLE t_style_process ADD COLUMN description VARCHAR(255) DEFAULT NULL COMMENT ''制作描述'' AFTER difficulty',
  'SELECT 1'
);
PREPARE fix_stmt FROM @ddl;
EXECUTE fix_stmt;
DEALLOCATE PREPARE fix_stmt;
