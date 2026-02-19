-- 租户付费状态字段迁移
-- 执行命令: docker exec -i fashion-mysql-simple mysql -uroot -pchangeme fashion_supplychain < sql/add_tenant_paid_fields.sql

-- 逐列检查并添加（兼容 MySQL 5.7+）
SET @db = 'fashion_supplychain';
SET @tbl = 't_tenant';

-- paid_status
SET @col = 'paid_status';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN paid_status VARCHAR(20) NOT NULL DEFAULT ''TRIAL'' COMMENT ''付费状态: TRIAL=免费试用, PAID=已付费'''),
  'SELECT ''paid_status already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- apply_username
SET @col = 'apply_username';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN apply_username VARCHAR(100) DEFAULT NULL COMMENT ''申请账号名（申请入驻流程专用）'''),
  'SELECT ''apply_username already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- apply_password
SET @col = 'apply_password';
SET @sql = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA=@db AND TABLE_NAME=@tbl AND COLUMN_NAME=@col) = 0,
  CONCAT('ALTER TABLE ', @tbl, ' ADD COLUMN apply_password VARCHAR(200) DEFAULT NULL COMMENT ''申请密码BCrypt（激活后清空）'''),
  'SELECT ''apply_password already exists'' AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 已有租户默认为免费试用
UPDATE t_tenant SET paid_status = 'TRIAL' WHERE paid_status IS NULL OR paid_status = '';

SELECT '迁移完成' AS result, COUNT(*) AS tenant_count FROM t_tenant;
