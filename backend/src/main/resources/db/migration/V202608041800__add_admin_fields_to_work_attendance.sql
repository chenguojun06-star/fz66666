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
--
-- 修复说明（2026-08-05）：
--   原版用 INSERT INTO information_schema.COLUMNS 加列（AP-WF-06 反模式），
--   information_schema 是只读系统视图，INSERT 永远失败，阻塞后续所有迁移。
--   改为 IF(condition, 'ALTER TABLE...', 'SELECT 1') + PREPARE/EXECUTE 幂等加列。
-- ==================================================================

-- 1. status 打卡状态
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_work_attendance'
       AND COLUMN_NAME  = 'status') = 0,
    'ALTER TABLE `t_work_attendance` ADD COLUMN `status` VARCHAR(16) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2. leave_type 休假类型
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_work_attendance'
       AND COLUMN_NAME  = 'leave_type') = 0,
    'ALTER TABLE `t_work_attendance` ADD COLUMN `leave_type` VARCHAR(16) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. operator_id 操作人ID
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_work_attendance'
       AND COLUMN_NAME  = 'operator_id') = 0,
    'ALTER TABLE `t_work_attendance` ADD COLUMN `operator_id` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 4. operator_name 操作人姓名
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_work_attendance'
       AND COLUMN_NAME  = 'operator_name') = 0,
    'ALTER TABLE `t_work_attendance` ADD COLUMN `operator_name` VARCHAR(64) DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 5. operate_time 操作时间
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_work_attendance'
       AND COLUMN_NAME  = 'operate_time') = 0,
    'ALTER TABLE `t_work_attendance` ADD COLUMN `operate_time` DATETIME DEFAULT NULL',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6. 新增索引：按状态查询（管理端列表筛选）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_work_attendance'
       AND INDEX_NAME   = 'idx_att_status') = 0,
    'CREATE INDEX `idx_att_status` ON `t_work_attendance`(`tenant_id`, `status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
