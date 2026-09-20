package com.fashion.supplychain.finance;

import com.fashion.supplychain.finance.util.SalaryCalculator;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * D-474：工资计算规则。这是钱的逻辑，算错要出事——必须逐条守住。
 */
class SalaryCalculatorTest {

    private static int cmp(BigDecimal a, BigDecimal b) {
        return a.compareTo(b);
    }

    private static SalaryCalculator.Input baseInput() {
        SalaryCalculator.Input in = new SalaryCalculator.Input();
        in.attendanceDays = 26;
        return in;
    }

    @Test
    @DisplayName("计时工资：工时 × 时薪")
    void hourlyWage() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.HOURLY;
        in.hourlyRate = new BigDecimal("20");
        in.totalWorkMinutes = 100 * 60; // 100 小时
        in.overtimeEnabled = false;
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        assertEquals(0, cmp(new BigDecimal("2000.00"), r.baseWage));
        assertEquals(0, cmp(BigDecimal.ZERO, r.overtimePay));
    }

    @Test
    @DisplayName("计时加班：超出应出勤总工时的部分按倍数加钱")
    void hourlyOvertime() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.HOURLY;
        in.hourlyRate = new BigDecimal("20");
        // 应出勤 26 天 × 8 小时 = 208 小时；实际 220 小时 → 加班 12 小时
        in.totalWorkMinutes = 220 * 60;
        in.overtimeEnabled = true;
        in.overtimeRate = new BigDecimal("1.5");
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        // 底薪 220×20=4400，加班费 12×20×0.5=120
        assertEquals(0, cmp(new BigDecimal("4400.00"), r.baseWage));
        assertEquals(0, cmp(new BigDecimal("120.00"), r.overtimePay));
        assertEquals(0, cmp(new BigDecimal("4520.00"), r.grossPay));
    }

    @Test
    @DisplayName("固定工资：日薪 = (月薪+岗位工资) ÷ 应出勤，再乘实际出勤")
    void fixedWage() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.FIXED;
        in.monthlySalary = new BigDecimal("5200");
        in.positionSalary = new BigDecimal("0");
        in.attendanceDays = 26;
        in.actualAttendanceDays = 26; // 全勤
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        assertEquals(0, cmp(new BigDecimal("5200.00"), r.baseWage));
    }

    @Test
    @DisplayName("固定工资缺勤：只发实际出勤天数的钱")
    void fixedWageWithAbsence() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.FIXED;
        in.monthlySalary = new BigDecimal("5200");
        in.attendanceDays = 26;
        in.actualAttendanceDays = 20; // 缺 6 天
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        // 日薪 200，出勤 20 天 = 4000
        assertEquals(0, cmp(new BigDecimal("4000.00"), r.baseWage));
    }

    @Test
    @DisplayName("全勤奖：无迟到无请假才发")
    void fullAttendanceBonus() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.FIXED;
        in.monthlySalary = new BigDecimal("5200");
        in.actualAttendanceDays = 26;
        in.fullAttendanceBonus = new BigDecimal("200");
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        assertTrue(r.fullAttendance);
        assertEquals(0, cmp(new BigDecimal("200.00"), r.bonus));

        // 有迟到 → 不发全勤奖
        in.lateCount = 1;
        SalaryCalculator.Result r2 = SalaryCalculator.calculate(in);
        assertFalse(r2.fullAttendance);
        assertEquals(0, cmp(BigDecimal.ZERO, r2.bonus));
    }

    @Test
    @DisplayName("迟到扣款：次数 × 每次金额")
    void lateDeduction() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.FIXED;
        in.monthlySalary = new BigDecimal("5200");
        in.actualAttendanceDays = 26;
        in.lateCount = 3;
        in.latePenalty = new BigDecimal("20");
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        assertEquals(0, cmp(new BigDecimal("60.00"), r.lateDeduction));
        // 5200 - 60 = 5140
        assertEquals(0, cmp(new BigDecimal("5140.00"), r.netPay));
    }

    @Test
    @DisplayName("请假扣款：事假按100%、病假按50%日薪扣")
    void leaveDeduction() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.FIXED;
        in.monthlySalary = new BigDecimal("5200");
        in.attendanceDays = 26;
        in.actualAttendanceDays = 26;
        in.leaveDays = new BigDecimal("2");   // 事假 2 天
        in.sickLeaveDays = new BigDecimal("1"); // 病假 1 天
        in.leaveDeductRatio = new BigDecimal("100");
        in.sickLeaveRatio = new BigDecimal("50");
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        // 日薪 200；事假 2×200=400，病假 1×200×0.5=100 → 共 500
        assertEquals(0, cmp(new BigDecimal("500.00"), r.leaveDeduction));
        // 有请假 → 无全勤奖
        assertFalse(r.fullAttendance);
    }

    @Test
    @DisplayName("实发不为负：扣款超过应发时按 0 计")
    void netPayNeverNegative() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.FIXED;
        in.monthlySalary = new BigDecimal("100");
        in.attendanceDays = 26;
        in.actualAttendanceDays = 1;
        in.lateCount = 50;
        in.latePenalty = new BigDecimal("100");
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        assertEquals(0, cmp(BigDecimal.ZERO, r.netPay));
    }

    @Test
    @DisplayName("计件：直接用外部算好的金额")
    void pieceWage() {
        SalaryCalculator.Input in = baseInput();
        in.salaryType = SalaryCalculator.SalaryType.PIECE;
        in.pieceWage = new BigDecimal("1234.56");
        SalaryCalculator.Result r = SalaryCalculator.calculate(in);
        assertEquals(0, cmp(new BigDecimal("1234.56"), r.baseWage));
        assertEquals(0, cmp(new BigDecimal("1234.56"), r.netPay));
    }
}
