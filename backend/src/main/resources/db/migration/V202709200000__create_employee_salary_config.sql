-- D-474：员工薪资配置表（计时/计件/固定三种薪资类型的规则，管理员在后台设定）
-- 对应实体：com.fashion.supplychain.finance.entity.EmployeeSalaryConfig
CREATE TABLE IF NOT EXISTS t_employee_salary_config (
  id varchar(36) NOT NULL,
  tenant_id bigint NOT NULL,
  user_id varchar(64) NOT NULL,
  user_name varchar(64) DEFAULT NULL,
  salary_type varchar(20) NOT NULL DEFAULT 'PIECE' COMMENT 'FIXED=固定月薪, HOURLY=计时, PIECE=计件',
  monthly_salary decimal(12,2) DEFAULT 0 COMMENT '月薪（固定工资用）',
  hourly_rate decimal(12,2) DEFAULT 20 COMMENT '时薪（计时工资用）',
  position_salary decimal(12,2) DEFAULT 0 COMMENT '岗位/技能工资',
  attendance_days int DEFAULT 26 COMMENT '月应出勤天数',
  full_attendance_bonus decimal(12,2) DEFAULT 200 COMMENT '全勤奖',
  late_penalty decimal(12,2) DEFAULT 20 COMMENT '迟到一次扣款',
  leave_deduct_ratio decimal(5,2) DEFAULT 100 COMMENT '事假扣款比例(%)',
  sick_leave_ratio decimal(5,2) DEFAULT 50 COMMENT '病假扣款比例(%)',
  overtime_enabled tinyint DEFAULT 1 COMMENT '是否算加班费',
  overtime_rate decimal(5,2) DEFAULT 1.5 COMMENT '平时加班倍数',
  status varchar(20) DEFAULT 'ACTIVE',
  delete_flag tinyint DEFAULT 0,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  update_time datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_user (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工薪资配置（固定/计时/计件 + 考勤扣款 + 奖金）';
