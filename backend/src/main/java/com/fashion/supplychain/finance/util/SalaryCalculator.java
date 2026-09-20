package com.fashion.supplychain.finance.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * D-474：工资计算（固定月薪 / 计时 / 计件 + 考勤扣款 + 奖金）。
 *
 * 纯函数，方便单测守护——工资算错是要出事的，必须有测试。
 *
 * 计算规则：
 * - 计时：时薪 × 工时，超出"应出勤天数×8小时"的部分算加班（默认 1.5 倍）
 * - 固定：日薪 = (月薪 + 岗位工资) ÷ 应出勤天数；应发 = 日薪 × 实际出勤天数
 * - 全勤奖：无迟到、无请假才发
 * - 扣款：迟到按次扣；事假/病假按日薪 × 比例扣
 */
public final class SalaryCalculator {

    /** 默认每天标准工时（用于算加班） */
    public static final int STANDARD_WORK_HOURS_PER_DAY = 8;

    private SalaryCalculator() {
    }

    public enum SalaryType {
        FIXED, HOURLY, PIECE
    }

    /** 计算输入 */
    public static class Input {
        public SalaryType salaryType = SalaryType.PIECE;
        public BigDecimal monthlySalary = BigDecimal.ZERO;
        public BigDecimal hourlyRate = BigDecimal.ZERO;
        public BigDecimal positionSalary = BigDecimal.ZERO;
        /** 应出勤天数 */
        public int attendanceDays = 26;
        /** 实际出勤天数（从考勤统计） */
        public int actualAttendanceDays = 0;
        /** 当月总工时（分钟） */
        public long totalWorkMinutes = 0;
        /** 迟到次数 */
        public int lateCount = 0;
        /** 事假天数 */
        public BigDecimal leaveDays = BigDecimal.ZERO;
        /** 病假天数 */
        public BigDecimal sickLeaveDays = BigDecimal.ZERO;
        /** 全勤奖 */
        public BigDecimal fullAttendanceBonus = BigDecimal.ZERO;
        /** 迟到一次扣款 */
        public BigDecimal latePenalty = BigDecimal.ZERO;
        /** 事假扣款比例(%) */
        public BigDecimal leaveDeductRatio = new BigDecimal("100");
        /** 病假扣款比例(%) */
        public BigDecimal sickLeaveRatio = new BigDecimal("50");
        /** 是否计算加班费 */
        public boolean overtimeEnabled = true;
        /** 加班倍数（平时） */
        public BigDecimal overtimeRate = new BigDecimal("1.5");
        /** 计件工资（外部传入，计件类型直接用） */
        public BigDecimal pieceWage = BigDecimal.ZERO;
    }

    /** 计算结果 */
    public static class Result {
        public BigDecimal baseWage = BigDecimal.ZERO;
        public BigDecimal overtimePay = BigDecimal.ZERO;
        public BigDecimal bonus = BigDecimal.ZERO;
        public BigDecimal lateDeduction = BigDecimal.ZERO;
        public BigDecimal leaveDeduction = BigDecimal.ZERO;
        public BigDecimal grossPay = BigDecimal.ZERO;
        public BigDecimal netPay = BigDecimal.ZERO;
        /** 是否全勤（用于展示） */
        public boolean fullAttendance = false;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    private static BigDecimal scale2(BigDecimal v) {
        return nz(v).setScale(2, RoundingMode.HALF_UP);
    }

    public static Result calculate(Input in) {
        Result r = new Result();

        // 日薪（固定工资用；计时工资不用，但请假扣款要按日薪折算）
        BigDecimal dailyBase = nz(in.monthlySalary).add(nz(in.positionSalary));
        BigDecimal dailySalary = in.attendanceDays > 0
                ? dailyBase.divide(BigDecimal.valueOf(in.attendanceDays), 6, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        // 1) 基本工资
        if (in.salaryType == SalaryType.HOURLY) {
            BigDecimal hours = BigDecimal.valueOf(in.totalWorkMinutes)
                    .divide(BigDecimal.valueOf(60), 4, RoundingMode.HALF_UP);
            r.baseWage = hours.multiply(nz(in.hourlyRate));

            // 加班：超出"应出勤天数 × 8 小时"的部分
            if (in.overtimeEnabled) {
                BigDecimal standardHours = BigDecimal.valueOf(in.attendanceDays)
                        .multiply(BigDecimal.valueOf(STANDARD_WORK_HOURS_PER_DAY));
                if (hours.compareTo(standardHours) > 0) {
                    BigDecimal overtimeHours = hours.subtract(standardHours);
                    // 加班费 = 加班工时 × 时薪 × (倍数 - 1)（底薪已按 1 倍算过）
                    r.overtimePay = overtimeHours
                            .multiply(nz(in.hourlyRate))
                            .multiply(nz(in.overtimeRate).subtract(BigDecimal.ONE));
                }
            }
        } else if (in.salaryType == SalaryType.FIXED) {
            r.baseWage = dailySalary.multiply(BigDecimal.valueOf(in.actualAttendanceDays));
            r.overtimePay = BigDecimal.ZERO;
        } else {
            // 计件：外部已算好直接带入
            r.baseWage = nz(in.pieceWage);
            r.overtimePay = BigDecimal.ZERO;
        }

        // 2) 全勤奖：无迟到、无请假
        r.fullAttendance = in.lateCount == 0
                && nz(in.leaveDays).compareTo(BigDecimal.ZERO) == 0
                && nz(in.sickLeaveDays).compareTo(BigDecimal.ZERO) == 0;
        r.bonus = r.fullAttendance ? nz(in.fullAttendanceBonus) : BigDecimal.ZERO;

        // 3) 扣款
        r.lateDeduction = nz(in.latePenalty).multiply(BigDecimal.valueOf(in.lateCount));
        BigDecimal leaveDed = nz(in.leaveDays).multiply(dailySalary)
                .multiply(nz(in.leaveDeductRatio).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        BigDecimal sickDed = nz(in.sickLeaveDays).multiply(dailySalary)
                .multiply(nz(in.sickLeaveRatio).divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        r.leaveDeduction = leaveDed.add(sickDed);

        // 4) 汇总
        r.grossPay = r.baseWage.add(r.overtimePay).add(r.bonus);
        r.netPay = r.grossPay.subtract(r.lateDeduction).subtract(r.leaveDeduction);
        if (r.netPay.compareTo(BigDecimal.ZERO) < 0) {
            r.netPay = BigDecimal.ZERO; // 不为负
        }

        // 统一保留 2 位
        r.baseWage = scale2(r.baseWage);
        r.overtimePay = scale2(r.overtimePay);
        r.bonus = scale2(r.bonus);
        r.lateDeduction = scale2(r.lateDeduction);
        r.leaveDeduction = scale2(r.leaveDeduction);
        r.grossPay = scale2(r.grossPay);
        r.netPay = scale2(r.netPay);
        return r;
    }
}
