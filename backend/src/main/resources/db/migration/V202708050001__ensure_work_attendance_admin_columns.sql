-- ==================================================================
-- V202708050001: 确保 t_work_attendance 管理端字段存在（终极修复）
-- ==================================================================
-- 背景：
--   V202608041800 用 INSERT INTO information_schema.COLUMNS 加列（无效，MySQL 系统视图不可写）。
--   V202608051800 用 CONCAT+COMMENT 方式修复，但：
--     a) 版本号 202608051800 < 202707192000（建表脚本），Flyway 按版本号排序执行时
--        在建表前执行，表不存在导致 ALTER TABLE 失败，被 FlywayRepairConfig 清理后
--        重试又失败，死循环 → 列从未被成功添加。
--     b) CONCAT 中 COMMENT ''xxx'' 会被 Flyway SQL 解析器截断。
--
--   结果：status/leave_type/operator_id/operator_name/operate_time 列缺失。
--   管理端接口（adminList/adminAdjust/adminCancel/adminSupplement/adminBatchLeave）
--   引用这些列时触发 BadSqlGrammarException → 前端显示"数据服务暂时不可用"。
--
-- 修复策略（参考 V202607192304 最佳实践）：
--   1. 版本号 202708050001 > 202707192000（建表脚本），确保在建表后执行
--   2. 不使用 CONCAT / COMMENT，避免 Flyway SQL 解析器截断
--   3. 用 IF(condition, 'ALTER TABLE ...', 'SELECT 1') 幂等加列（P0 #1）
--   4. 多租户安全（P0 铁律4）：仅加列，不影响 tenant_id 隔离
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

-- 6. 索引：按状态查询（管理端列表筛选）
SET @s = IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 't_work_attendance'
       AND INDEX_NAME   = 'idx_att_status') = 0,
    'CREATE INDEX `idx_att_status` ON `t_work_attendance`(`tenant_id`, `status`)',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
