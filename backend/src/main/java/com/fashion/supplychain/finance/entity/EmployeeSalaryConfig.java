package com.fashion.supplychain.finance.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * D-474：员工薪资配置（管理员可在页面上设定，不写死在代码里）。
 * 支持三种薪资类型：固定月薪 / 计时 / 计件，
 * 含考勤扣款（迟到、事假、病假）与奖金（全勤奖）规则、加班倍数。
 */
@Data
@TableName("t_employee_salary_config")
public class EmployeeSalaryConfig {

    @TableId(type = IdType.ASSIGN_UUID)
    private String id;

    private Long tenantId;
    private String userId;
    private String userName;

    /** FIXED=固定月薪, HOURLY=计时, PIECE=计件 */
    private String salaryType;

    /** 月薪（固定工资用） */
    private BigDecimal monthlySalary;
    /** 时薪（计时工资用） */
    private BigDecimal hourlyRate;
    /** 岗位/技能工资 */
    private BigDecimal positionSalary;
    /** 月应出勤天数 */
    private Integer attendanceDays;
    /** 全勤奖（无迟到无请假才发） */
    private BigDecimal fullAttendanceBonus;
    /** 迟到一次扣款 */
    private BigDecimal latePenalty;
    /** 事假扣款比例(%) */
    private BigDecimal leaveDeductRatio;
    /** 病假扣款比例(%) */
    private BigDecimal sickLeaveRatio;
    /** 是否计算加班费：1=是 0=否 */
    private Integer overtimeEnabled;
    /** 加班倍数（平时，如 1.5） */
    private BigDecimal overtimeRate;

    /** 上班时间 HH:mm（考勤未标状态时用于判断迟到，默认 09:00） */
    private String workStartTime;

    private String status;
    private Integer deleteFlag;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
