-- D-474：薪资配置加「下班时间」+「标准工时」——原来只有上班时间，没法判加班工时边界
-- 对应实体字段：EmployeeSalaryConfig.workEndTime / standardWorkHours
--
-- 幂等化（D-523 修复，同 V202709200001）：
--   原脚本是两条无条件 ALTER TABLE ADD COLUMN。云端这两列已由 schema 同步先行建好，
--   每次启动都报 `Duplicate column name 'work_end_time'`。更隐蔽的是：两条 ALTER 分开写，
--   DDL 不走事务 —— 第一条成功、第二条失败时，第一条的列会**永久留在库里**，
--   Flyway 只标记整条迁移失败；失败记录被 FlywayRepairConfig 清理后重试，
--   就变成"第一条必然重复"的死循环，永远修不好。
--   改为逐列先查 information_schema 再决定是否 ADD COLUMN，重复执行安全。

-- ① 下班时间
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_employee_salary_config'
               AND COLUMN_NAME  = 'work_end_time') = 0,
    'ALTER TABLE `t_employee_salary_config` ADD COLUMN `work_end_time` VARCHAR(5) DEFAULT ''18:00'' COMMENT ''下班时间 HH:mm（如 18:00、17:30）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ② 标准日工时
SET @s = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME   = 't_employee_salary_config'
               AND COLUMN_NAME  = 'standard_work_hours') = 0,
    'ALTER TABLE `t_employee_salary_config` ADD COLUMN `standard_work_hours` DECIMAL(4,1) DEFAULT 8 COMMENT ''标准日工时（用于算加班，超出算加班工时）''',
    'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
