-- D-474：薪资配置增加「上班时间」——原来代码里写死 9:00 判迟到，实际上班时间不同会误判
-- 对应实体字段：EmployeeSalaryConfig.workStartTime
--
-- 幂等化（D-523 修复）：
--   原脚本是无条件 ALTER TABLE ADD COLUMN。云端 schema 曾由 DbColumnDefinitions /
--   手工 SQL 先行同步过该列，导致每次启动 Flyway 都报
--   `Duplicate column name 'work_start_time'`。虽然 FlywayRepairConfig 会清理失败记录
--   保证应用能启动，但每次重启都刷 ERROR 并多耗几秒。
--   改为先查 information_schema 再决定是否 ADD COLUMN（与 V45 同一写法），重复执行安全。

SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_employee_salary_config'
               AND COLUMN_NAME  = 'work_start_time') = 0,
    'ALTER TABLE `t_employee_salary_config` ADD COLUMN `work_start_time` VARCHAR(5) DEFAULT ''09:00'' COMMENT ''上班时间(HH:mm)，考勤未标状态时用于判断迟到''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
