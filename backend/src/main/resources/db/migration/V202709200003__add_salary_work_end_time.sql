-- D-474：薪资配置加「下班时间」+「标准工时」——原来只有上班时间，没法判加班工时边界
-- 对应实体字段：EmployeeSalaryConfig.workEndTime / standardWorkHours
ALTER TABLE t_employee_salary_config
  ADD COLUMN work_end_time varchar(5) DEFAULT '18:00' COMMENT '下班时间 HH:mm（如 18:00、17:30）';
ALTER TABLE t_employee_salary_config
  ADD COLUMN standard_work_hours decimal(4,1) DEFAULT 8 COMMENT '标准日工时（用于算加班，超出算加班工时）';
