-- ==================================================================
-- V202608041800: t_work_attendance 新增管理端字段
-- ==================================================================
-- 背景：
--   原表仅支持员工自助打卡，无法处理"休假/漏打卡补录/调整/作废"场景。
--   管理员需要补录员工漏打卡、标记休假、调整错误打卡、作废异常打卡。
--
-- 新增字段：
--   status       打卡状态：NORMAL/LATE/EARLY_LEAVE/ABNORMAL/LEAVE/ADJUSTED/CANCELLED
--   leave_type   休假类型：LEGAL_HOLIDAY/SICK/PERSONAL/ANNUAL/MATERNITY/OTHER
--   operator_id  操作人ID（区分员工自打卡 vs 管理员补录/调整）
--   operator_name 操作人姓名
--   operate_time 操作时间（管理员操作时间，区别于 create_time）
--
-- 多租户安全（P0 铁律4）：本表已含 tenant_id，本次仅加列不影响隔离
-- 关联：P0 #1 Flyway 强制幂等
-- ==================================================================

-- 1. status 打卡状态
INSERT INTO information_schema.COLUMNS (TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT)
SELECT TABLE_SCHEMA, 't_work_attendance', 'status', 'VARCHAR(16)', 'YES', NULL, '打卡状态：NORMAL/LATE/EARLY_LEAVE/ABNORMAL/LEAVE/ADJUSTED/CANCELLED'
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'status'
  );

-- 2. leave_type 休假类型
INSERT INTO information_schema.COLUMNS (TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT)
SELECT TABLE_SCHEMA, 't_work_attendance', 'leave_type', 'VARCHAR(16)', 'YES', NULL, '休假类型：LEGAL_HOLIDAY/SICK/PERSONAL/ANNUAL/MATERNITY/OTHER'
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'leave_type'
  );

-- 3. operator_id 操作人ID
INSERT INTO information_schema.COLUMNS (TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT)
SELECT TABLE_SCHEMA, 't_work_attendance', 'operator_id', 'VARCHAR(64)', 'YES', NULL, '操作人ID（管理员补录/调整时记录）'
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'operator_id'
  );

-- 4. operator_name 操作人姓名
INSERT INTO information_schema.COLUMNS (TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT)
SELECT TABLE_SCHEMA, 't_work_attendance', 'operator_name', 'VARCHAR(64)', 'YES', NULL, '操作人姓名'
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'operator_name'
  );

-- 5. operate_time 操作时间
INSERT INTO information_schema.COLUMNS (TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_COMMENT)
SELECT TABLE_SCHEMA, 't_work_attendance', 'operate_time', 'DATETIME', 'YES', NULL, '操作时间（管理员操作时间）'
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'operate_time'
  );

-- 6. 新增索引：按状态查询（管理端列表筛选）
SET @s = CONCAT('CREATE INDEX idx_att_status ON t_work_attendance(tenant_id, status) ');
SELECT COUNT(1) INTO @exists FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND INDEX_NAME = 'idx_att_status';
SET @s = IF(@exists = 0, @s, 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
