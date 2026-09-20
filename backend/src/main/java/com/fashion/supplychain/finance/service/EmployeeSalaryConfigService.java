package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.EmployeeSalaryConfig;
import com.fashion.supplychain.finance.mapper.EmployeeSalaryConfigMapper;
import com.fashion.supplychain.finance.util.SalaryCalculator;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.production.entity.WorkAttendance;
import com.fashion.supplychain.production.mapper.WorkAttendanceMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * D-474：员工薪资配置与工资计算。
 * 所有规则（时薪/月薪/全勤奖/扣款比例/加班倍数）都存在配置表里，
 * 管理员在页面上改，代码不写死任何数字。
 */
@Service
public class EmployeeSalaryConfigService extends ServiceImpl<EmployeeSalaryConfigMapper, EmployeeSalaryConfig> {

    /** 默认上班时间（用于判断迟到；后续可做成配置项） */
    private static final LocalTime DEFAULT_WORK_START = LocalTime.of(9, 0);

    @Autowired
    private WorkAttendanceMapper workAttendanceMapper;

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    /** 配置列表 */
    public List<EmployeeSalaryConfig> listConfigs(Long tenantId) {
        return this.lambdaQuery()
                .eq(EmployeeSalaryConfig::getTenantId, tenantId)
                .eq(EmployeeSalaryConfig::getDeleteFlag, 0)
                .list();
    }

    /** 新增或更新（按员工唯一，存在则更新） */
    public EmployeeSalaryConfig saveConfig(EmployeeSalaryConfig config, Long tenantId) {
        config.setTenantId(tenantId);
        if (config.getDeleteFlag() == null) {
            config.setDeleteFlag(0);
        }
        if (config.getStatus() == null) {
            config.setStatus("ACTIVE");
        }
        // 默认值兜底，避免管理员留空导致算不出来
        if (config.getAttendanceDays() == null) {
            config.setAttendanceDays(26);
        }
        if (config.getHourlyRate() == null) {
            config.setHourlyRate(new BigDecimal("20"));
        }
        if (config.getFullAttendanceBonus() == null) {
            config.setFullAttendanceBonus(new BigDecimal("200"));
        }
        if (config.getLatePenalty() == null) {
            config.setLatePenalty(new BigDecimal("20"));
        }
        if (config.getOvertimeRate() == null) {
            config.setOvertimeRate(new BigDecimal("1.5"));
        }
        if (config.getLeaveDeductRatio() == null) {
            config.setLeaveDeductRatio(new BigDecimal("100"));
        }
        if (config.getSickLeaveRatio() == null) {
            config.setSickLeaveRatio(new BigDecimal("50"));
        }
        if (config.getOvertimeEnabled() == null) {
            config.setOvertimeEnabled(1);
        }

        EmployeeSalaryConfig exist = this.lambdaQuery()
                .eq(EmployeeSalaryConfig::getTenantId, tenantId)
                .eq(EmployeeSalaryConfig::getUserId, config.getUserId())
                .eq(EmployeeSalaryConfig::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (exist != null) {
            config.setId(exist.getId());
            this.updateById(config);
        } else {
            if (config.getId() == null) {
                config.setId(UUID.randomUUID().toString().replace("-", ""));
            }
            this.save(config);
        }
        return config;
    }

    /**
     * 计算某员工某月工资：汇总考勤 → 按配置算（固定/计时/计件 + 扣款 + 奖金）
     *
     * @param userId 员工ID
     * @param month  月份 yyyy-MM
     */
    public Map<String, Object> calculate(String userId, String month, Long tenantId) {
        Map<String, Object> result = new HashMap<>();

        EmployeeSalaryConfig cfg = this.lambdaQuery()
                .eq(EmployeeSalaryConfig::getTenantId, tenantId)
                .eq(EmployeeSalaryConfig::getUserId, userId)
                .eq(EmployeeSalaryConfig::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (cfg == null) {
            result.put("configured", false);
            result.put("message", "该员工还没设置薪资规则，请先在薪资配置里设定");
            return result;
        }

        // 汇总当月考勤
        LocalDate start = LocalDate.parse(month + "-01");
        LocalDate end = start.plusMonths(1);
        List<WorkAttendance> attendanceList = workAttendanceMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<WorkAttendance>()
                        .eq(WorkAttendance::getTenantId, tenantId)
                        .eq(WorkAttendance::getUserId, userId)
                        .eq(WorkAttendance::getDeleteFlag, 0)
                        .ge(WorkAttendance::getWorkDate, start)
                        .lt(WorkAttendance::getWorkDate, end));

        long totalMinutes = 0;
        int lateCount = 0;
        BigDecimal leaveDays = BigDecimal.ZERO;
        BigDecimal sickLeaveDays = BigDecimal.ZERO;
        java.util.Set<String> workDates = new java.util.HashSet<>();

        for (WorkAttendance a : attendanceList) {
            if (a.getWorkMinutes() != null) {
                totalMinutes += a.getWorkMinutes();
            }
            if (a.getWorkDate() != null) {
                workDates.add(a.getWorkDate().toString());
            }
            // 迟到：优先用考勤里标记的状态（LATE / LATE_EARLY_LEAVE），
            // 没标状态时才用"打卡晚于上班时间"兜底推算
            String st = a.getStatus();
            boolean lateByStatus = st != null
                    && ("LATE".equalsIgnoreCase(st) || "LATE_EARLY_LEAVE".equalsIgnoreCase(st));
            LocalDateTime in = a.getClockInTime();
            boolean lateByTime = in != null && in.toLocalTime().isAfter(DEFAULT_WORK_START);
            if (lateByStatus || lateByTime) {
                lateCount++;
            }
            // 请假：按 leave_type 区分事假/病假
            String leaveType = a.getLeaveType();
            if (leaveType != null) {
                if ("SICK".equalsIgnoreCase(leaveType) || "病假".equals(leaveType)) {
                    sickLeaveDays = sickLeaveDays.add(BigDecimal.ONE);
                } else {
                    leaveDays = leaveDays.add(BigDecimal.ONE);
                }
            }
        }

        SalaryCalculator.Input in = new SalaryCalculator.Input();
        in.salaryType = parseType(cfg.getSalaryType());
        in.monthlySalary = cfg.getMonthlySalary();
        in.hourlyRate = cfg.getHourlyRate();
        in.positionSalary = cfg.getPositionSalary();
        in.attendanceDays = cfg.getAttendanceDays() != null ? cfg.getAttendanceDays() : 26;
        in.actualAttendanceDays = workDates.size();
        in.totalWorkMinutes = totalMinutes;
        in.lateCount = lateCount;
        in.leaveDays = leaveDays;
        in.sickLeaveDays = sickLeaveDays;
        in.fullAttendanceBonus = cfg.getFullAttendanceBonus();
        in.latePenalty = cfg.getLatePenalty();
        in.leaveDeductRatio = cfg.getLeaveDeductRatio();
        in.sickLeaveRatio = cfg.getSickLeaveRatio();
        in.overtimeEnabled = cfg.getOvertimeEnabled() != null && cfg.getOvertimeEnabled() == 1;
        in.overtimeRate = cfg.getOvertimeRate();

        SalaryCalculator.Result calc = SalaryCalculator.calculate(in);

        result.put("configured", true);
        result.put("userId", userId);
        result.put("userName", cfg.getUserName());
        result.put("month", month);
        result.put("salaryType", cfg.getSalaryType());
        result.put("attendanceDays", workDates.size());
        result.put("totalHours", new BigDecimal(totalMinutes).divide(BigDecimal.valueOf(60), 2, java.math.RoundingMode.HALF_UP));
        result.put("lateCount", lateCount);
        result.put("leaveDays", leaveDays);
        result.put("sickLeaveDays", sickLeaveDays);
        result.put("baseWage", calc.baseWage);
        result.put("overtimePay", calc.overtimePay);
        result.put("bonus", calc.bonus);
        result.put("lateDeduction", calc.lateDeduction);
        result.put("leaveDeduction", calc.leaveDeduction);
        result.put("grossPay", calc.grossPay);
        result.put("netPay", calc.netPay);
        result.put("fullAttendance", calc.fullAttendance);
        return result;
    }

    private static SalaryCalculator.SalaryType parseType(String t) {
        if (t == null) {
            return SalaryCalculator.SalaryType.PIECE;
        }
        if ("FIXED".equalsIgnoreCase(t)) {
            return SalaryCalculator.SalaryType.FIXED;
        }
        if ("HOURLY".equalsIgnoreCase(t)) {
            return SalaryCalculator.SalaryType.HOURLY;
        }
        return SalaryCalculator.SalaryType.PIECE;
    }

    /**
     * D-474：一键生成当月工资单 —— 给每个配了薪资规则的员工算工资，
     * 并推送成应付账单（sourceType=SALARY，按「SALARY-员工-月份」幂等，重复点不会重复生成）。
     * 生成后就能在收付款中心看到并付款核销，走的是和计件工资同一条路。
     */
    public Map<String, Object> generateMonthlyBills(String month, Long tenantId) {
        List<EmployeeSalaryConfig> configs = listConfigs(tenantId);
        int created = 0;
        int skipped = 0;
        BigDecimal total = BigDecimal.ZERO;
        java.util.List<String> names = new java.util.ArrayList<>();

        for (EmployeeSalaryConfig cfg : configs) {
            Map<String, Object> calc = calculate(cfg.getUserId(), month, tenantId);
            if (!Boolean.TRUE.equals(calc.get("configured"))) {
                skipped++;
                continue;
            }
            Object netObj = calc.get("netPay");
            BigDecimal netPay = netObj == null
                    ? BigDecimal.ZERO
                    : new BigDecimal(String.valueOf(netObj));
            if (netPay.compareTo(BigDecimal.ZERO) <= 0) {
                skipped++;
                continue;
            }

            BillAggregationOrchestrator.BillPushRequest req =
                    new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("PAYABLE");
            req.setBillCategory("PAYROLL");
            req.setSourceType("SALARY");
            req.setSourceId("SALARY-" + cfg.getUserId() + "-" + month);
            req.setSourceNo("SALARY-" + month);
            req.setCounterpartyType("WORKER");
            req.setCounterpartyId(cfg.getUserId());
            req.setCounterpartyName(cfg.getUserName() != null ? cfg.getUserName() : cfg.getUserId());
            req.setAmount(netPay);
            req.setSettlementMonth(month);
            req.setRemark(String.format("%s 工资：基本 %s + 加班 %s + 全勤 %s - 扣款 %s（出勤%s天/迟到%s次）",
                    month,
                    calc.get("baseWage"), calc.get("overtimePay"), calc.get("bonus"),
                    new BigDecimal(String.valueOf(calc.get("lateDeduction") == null ? 0 : calc.get("lateDeduction")))
                            .add(new BigDecimal(String.valueOf(calc.get("leaveDeduction") == null ? 0 : calc.get("leaveDeduction")))),
                    calc.get("attendanceDays"), calc.get("lateCount")));

            billAggregationOrchestrator.pushBill(req);
            created++;
            total = total.add(netPay);
            names.add(req.getCounterpartyName());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("month", month);
        result.put("created", created);
        result.put("skipped", skipped);
        result.put("total", total);
        result.put("names", names);
        return result;
    }
}
