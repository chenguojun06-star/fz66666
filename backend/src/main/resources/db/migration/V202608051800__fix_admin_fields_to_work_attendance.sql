-- ==================================================================
-- V202608051800: 修复 t_work_attendance 管理端字段（status/leave_type/operator_id/operator_name/operate_time）
-- ==================================================================
-- 背景：
--   V202608041800 用 INSERT INTO information_schema.COLUMNS 方式加列，
--   该方式在 MySQL 中不生效（information_schema 是系统视图，INSERT 不会修改表结构）。
--   导致 status 等列实际未添加，selectAdminStats 引用 status 列时 BadSqlGrammarException → 500。
--
-- 修复：用 ALTER TABLE + PREPARE 幂等加列（P0 #1 Flyway 强制幂等）
-- 多租户安全（P0 铁律4）：仅加列，不影响 tenant_id 隔离
-- ==================================================================

-- 1. status 打卡状态
SET @s = CONCAT('ALTER TABLE t_work_attendance ADD COLUMN status VARCHAR(16) DEFAULT NULL COMMENT ''打卡状态：NORMAL/LATE/EARLY_LEAVE/ABNORMAL/LEAVE/ADJUSTED/CANCELLED''');
SELECT COUNT(1) INTO @exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'status';
SET @s = IF(@exists = 0, @s, 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. leave_type 休假类型
SET @s = CONCAT('ALTER TABLE t_work_attendance ADD COLUMN leave_type VARCHAR(16) DEFAULT NULL COMMENT ''休假类型：LEGAL_HOLIDAY/SICK/PERSONAL/ANNUAL/MATERNITY/OTHER''');
SELECT COUNT(1) INTO @exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'leave_type';
SET @s = IF(@exists = 0, @s, 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. operator_id 操作人ID
SET @s = CONCAT('ALTER TABLE t_work_attendance ADD COLUMN operator_id VARCHAR(64) DEFAULT NULL COMMENT ''操作人ID（管理员补录/调整时记录）''');
SELECT COUNT(1) INTO @exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'operator_id';
SET @s = IF(@exists = 0, @s, 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. operator_name 操作人姓名
SET @s = CONCAT('ALTER TABLE t_work_attendance ADD COLUMN operator_name VARCHAR(64) DEFAULT NULL COMMENT ''操作人姓名''');
SELECT COUNT(1) INTO @exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'operator_name';
SET @s = IF(@exists = 0, @s, 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. operate_time 操作时间
SET @s = CONCAT('ALTER TABLE t_work_attendance ADD COLUMN operate_time DATETIME DEFAULT NULL COMMENT ''操作时间（管理员操作时间）''');
SELECT COUNT(1) INTO @exists FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND COLUMN_NAME = 'operate_time';
SET @s = IF(@exists = 0, @s, 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. 索引：按状态查询（管理端列表筛选）
SET @s = CONCAT('CREATE INDEX idx_att_status ON t_work_attendance(tenant_id, status)');
SELECT COUNT(1) INTO @exists FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 't_work_attendance' AND INDEX_NAME = 'idx_att_status';
SET @s = IF(@exists = 0, @s, 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
