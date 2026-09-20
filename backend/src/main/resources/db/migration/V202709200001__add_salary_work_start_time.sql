-- D-474：薪资配置增加「上班时间」——原来代码里写死 9:00 判迟到，实际上班时间不同会误判
-- 对应实体字段：EmployeeSalaryConfig.workStartTime
ALTER TABLE t_employee_salary_config
  ADD COLUMN work_start_time varchar(5) DEFAULT '09:00' COMMENT '上班时间(HH:mm)，考勤未标状态时用于判断迟到';
