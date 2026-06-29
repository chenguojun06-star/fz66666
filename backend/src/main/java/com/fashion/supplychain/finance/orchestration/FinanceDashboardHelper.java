package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.entity.EmployeeAdvance;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import com.fashion.supplychain.finance.service.EmployeeAdvanceService;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 财务总览聚合 Helper。
 * <p>
 * 数据源（全部带 tenant_id 过滤，P0 铁律 #4）：
 * - 营收：t_shipment_reconciliation (status=paid, finalAmount) + t_ec_sales_revenue (status in confirmed/reconciled, payAmount)
 * - 应付账款：t_payable (status in PENDING/PARTIAL/OVERDUE) 的 (amount - paidAmount)
 * - 工资支出：t_wage_payment (status=success, amount)
 * - 物料成本：t_material_reconciliation (status in approved/paid, finalAmount)
 * - 费用支出：t_expense_reimbursement (status in approved/paid, amount)
 * - 员工借支：t_employee_advance (repaymentStatus != completed, remainingAmount)
 * <p>
 * 单次查询限制 LIMIT 5000，避免全表扫描拖垮数据库。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class FinanceDashboardHelper {

    private final PayableService payableService;
    private final EcSalesRevenueService ecSalesRevenueService;
    private final MaterialReconciliationService materialReconciliationService;
    private final WagePaymentService wagePaymentService;
    private final ExpenseReimbursementService expenseReimbursementService;
    private final EmployeeAdvanceService employeeAdvanceService;
    private final ShipmentReconciliationService shipmentReconciliationService;

    private static final DateTimeFormatter MONTH_FMT = DateTimeFormatter.ofPattern("yyyy-MM");
    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final int QUERY_LIMIT = 5000;
    private static final int DETAIL_LIMIT = 10;

    public Map<String, Object> buildDashboardSummary(String startDate, String endDate) {
        Long tenantId = TenantAssert.requireTenantIdOrSuperAdmin();
        if (tenantId == null) {
            return buildEmptyDashboard();
        }

        LocalDate start = parseDateOrDefault(startDate, LocalDate.now().withDayOfYear(1));
        LocalDate end = parseDateOrDefault(endDate, LocalDate.now());
        LocalDateTime startTime = start.atStartOfDay();
        LocalDateTime endTime = end.atTime(23, 59, 59);

        Map<String, Object> result = new LinkedHashMap<>();

        // 1. 汇总指标
        result.put("summary", buildSummary(tenantId, startTime, endTime));

        // 2. 营收/成本趋势（按月聚合）
        result.put("revenueTrend", buildRevenueTrend(tenantId, start, end));

        // 3. 成本结构饼图
        result.put("costStructure", buildCostStructure(tenantId, startTime, endTime));

        // 4. 各类别明细列表
        result.put("details", buildDetails(tenantId, startTime, endTime));

        return result;
    }

    // ============================================================
    // 一、汇总指标
    // ============================================================

    private Map<String, Object> buildSummary(Long tenantId, LocalDateTime startTime, LocalDateTime endTime) {
        BigDecimal revenueFromShipment = sumShipmentRevenue(tenantId, startTime, endTime);
        BigDecimal revenueFromEc = sumEcRevenue(tenantId, startTime, endTime);
        BigDecimal totalRevenue = revenueFromShipment.add(revenueFromEc);

        BigDecimal accountsPayable = sumPayableOutstanding(tenantId);
        BigDecimal wageExpense = sumWagePaid(tenantId, startTime, endTime);
        BigDecimal materialCost = sumMaterialCost(tenantId, startTime, endTime);
        BigDecimal expenseCost = sumExpenseCost(tenantId, startTime, endTime);
        BigDecimal advanceAmount = sumAdvanceOutstanding(tenantId);
        BigDecimal totalCost = wageExpense.add(materialCost).add(expenseCost).add(advanceAmount);
        BigDecimal netProfit = totalRevenue.subtract(totalCost);

        int pendingApprovals = countPendingApprovals(tenantId);
        int overdueCount = countOverduePayables(tenantId);

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRevenue", totalRevenue);
        summary.put("accountsPayable", accountsPayable);
        summary.put("wageExpense", wageExpense);
        summary.put("materialCost", materialCost);
        summary.put("expenseCost", expenseCost);
        summary.put("advanceAmount", advanceAmount);
        summary.put("totalCost", totalCost);
        summary.put("netProfit", netProfit);
        summary.put("pendingApprovals", pendingApprovals);
        summary.put("overdueCount", overdueCount);
        return summary;
    }

    private BigDecimal sumShipmentRevenue(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<ShipmentReconciliation> qw = new LambdaQueryWrapper<>();
            qw.eq(ShipmentReconciliation::getTenantId, tenantId)
              .eq(ShipmentReconciliation::getStatus, "paid")
              .ge(ShipmentReconciliation::getPaidAt, start)
              .le(ShipmentReconciliation::getPaidAt, end)
              .last("LIMIT " + QUERY_LIMIT);
            List<ShipmentReconciliation> list = shipmentReconciliationService.list(qw);
            return list.stream()
                    .map(r -> r.getFinalAmount() != null ? r.getFinalAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[财务总览] 统计出货营收失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumEcRevenue(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<EcSalesRevenue> qw = new LambdaQueryWrapper<>();
            qw.eq(EcSalesRevenue::getTenantId, tenantId)
              .in(EcSalesRevenue::getStatus, Arrays.asList("confirmed", "reconciled"))
              .ge(EcSalesRevenue::getCompleteTime, start)
              .le(EcSalesRevenue::getCompleteTime, end)
              .last("LIMIT " + QUERY_LIMIT);
            List<EcSalesRevenue> list = ecSalesRevenueService.list(qw);
            return list.stream()
                    .map(r -> r.getPayAmount() != null ? r.getPayAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[财务总览] 统计电商营收失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumPayableOutstanding(Long tenantId) {
        try {
            LambdaQueryWrapper<Payable> qw = new LambdaQueryWrapper<>();
            qw.eq(Payable::getTenantId, tenantId)
              .eq(Payable::getDeleteFlag, 0)
              .in(Payable::getStatus, Arrays.asList("PENDING", "PARTIAL", "OVERDUE"))
              .last("LIMIT " + QUERY_LIMIT);
            List<Payable> list = payableService.list(qw);
            return list.stream()
                    .map(p -> {
                        BigDecimal amount = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;
                        BigDecimal paid = p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO;
                        return amount.subtract(paid);
                    })
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[财务总览] 统计应付账款失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumWagePaid(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<WagePayment> qw = new LambdaQueryWrapper<>();
            qw.eq(WagePayment::getTenantId, tenantId)
              .eq(WagePayment::getStatus, "success")
              .ge(WagePayment::getPaymentTime, start)
              .le(WagePayment::getPaymentTime, end)
              .last("LIMIT " + QUERY_LIMIT);
            List<WagePayment> list = wagePaymentService.list(qw);
            return list.stream()
                    .map(w -> w.getAmount() != null ? w.getAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[财务总览] 统计工资支出失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumMaterialCost(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<MaterialReconciliation> qw = new LambdaQueryWrapper<>();
            qw.eq(MaterialReconciliation::getTenantId, tenantId)
              .eq(MaterialReconciliation::getDeleteFlag, 0)
              .in(MaterialReconciliation::getStatus, Arrays.asList("approved", "paid"))
              .ge(MaterialReconciliation::getApprovedAt, start)
              .le(MaterialReconciliation::getApprovedAt, end)
              .last("LIMIT " + QUERY_LIMIT);
            List<MaterialReconciliation> list = materialReconciliationService.list(qw);
            return list.stream()
                    .map(m -> m.getFinalAmount() != null ? m.getFinalAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[财务总览] 统计物料成本失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumExpenseCost(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<ExpenseReimbursement> qw = new LambdaQueryWrapper<>();
            qw.eq(ExpenseReimbursement::getTenantId, tenantId)
              .eq(ExpenseReimbursement::getDeleteFlag, 0)
              .in(ExpenseReimbursement::getStatus, Arrays.asList("approved", "paid"))
              .ge(ExpenseReimbursement::getApprovalTime, start)
              .le(ExpenseReimbursement::getApprovalTime, end)
              .last("LIMIT " + QUERY_LIMIT);
            List<ExpenseReimbursement> list = expenseReimbursementService.list(qw);
            return list.stream()
                    .map(e -> e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[财务总览] 统计费用支出失败", e);
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal sumAdvanceOutstanding(Long tenantId) {
        try {
            LambdaQueryWrapper<EmployeeAdvance> qw = new LambdaQueryWrapper<>();
            qw.eq(EmployeeAdvance::getTenantId, tenantId)
              .eq(EmployeeAdvance::getDeleteFlag, 0)
              .ne(EmployeeAdvance::getRepaymentStatus, "repaid")
              .last("LIMIT " + QUERY_LIMIT);
            List<EmployeeAdvance> list = employeeAdvanceService.list(qw);
            return list.stream()
                    .map(a -> a.getRemainingAmount() != null ? a.getRemainingAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } catch (Exception e) {
            log.warn("[财务总览] 统计借支余额失败", e);
            return BigDecimal.ZERO;
        }
    }

    private int countPendingApprovals(Long tenantId) {
        int count = 0;
        count += safeCount(() -> materialReconciliationService.count(new LambdaQueryWrapper<MaterialReconciliation>()
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(MaterialReconciliation::getStatus, "pending")));
        count += safeCount(() -> expenseReimbursementService.count(new LambdaQueryWrapper<ExpenseReimbursement>()
                .eq(ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getDeleteFlag, 0)
                .eq(ExpenseReimbursement::getStatus, "pending")));
        count += safeCount(() -> employeeAdvanceService.count(new LambdaQueryWrapper<EmployeeAdvance>()
                .eq(EmployeeAdvance::getTenantId, tenantId)
                .eq(EmployeeAdvance::getDeleteFlag, 0)
                .eq(EmployeeAdvance::getStatus, "pending")));
        count += safeCount(() -> shipmentReconciliationService.count(new LambdaQueryWrapper<ShipmentReconciliation>()
                .eq(ShipmentReconciliation::getTenantId, tenantId)
                .eq(ShipmentReconciliation::getStatus, "pending")));
        return count;
    }

    private int countOverduePayables(Long tenantId) {
        return safeCount(() -> payableService.count(new LambdaQueryWrapper<Payable>()
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0)
                .eq(Payable::getStatus, "OVERDUE")));
    }

    // ============================================================
    // 二、营收/成本趋势（按月聚合）
    // ============================================================

    private List<Map<String, Object>> buildRevenueTrend(Long tenantId, LocalDate start, LocalDate end) {
        // 按月分桶
        LinkedHashMap<String, Map<String, BigDecimal>> monthBuckets = new LinkedHashMap<>();
        LocalDate cursor = start.withDayOfMonth(1);
        LocalDate endMonth = end.withDayOfMonth(1);
        while (!cursor.isAfter(endMonth)) {
            String key = cursor.format(MONTH_FMT);
            monthBuckets.put(key, initMonthBucket());
            cursor = cursor.plusMonths(1);
        }

        // 聚合营收（出货 + 电商）
        aggregateRevenueByMonth(tenantId, start, end, monthBuckets);
        // 聚合成本（工资 + 物料 + 费用 + 借支）
        aggregateCostByMonth(tenantId, start, end, monthBuckets);

        // 转换为前端需要的格式：label（中文月）+ revenue/cost/profit
        List<Map<String, Object>> trend = new ArrayList<>();
        for (Map.Entry<String, Map<String, BigDecimal>> entry : monthBuckets.entrySet()) {
            String ym = entry.getKey();
            Map<String, BigDecimal> bucket = entry.getValue();
            BigDecimal revenue = bucket.get("revenue");
            BigDecimal cost = bucket.get("cost");
            BigDecimal profit = revenue.subtract(cost);

            Map<String, Object> point = new LinkedHashMap<>();
            point.put("label", ym.substring(5) + "月"); // "MM月"
            point.put("revenue", revenue);
            point.put("cost", cost);
            point.put("profit", profit);
            trend.add(point);
        }
        return trend;
    }

    private Map<String, BigDecimal> initMonthBucket() {
        Map<String, BigDecimal> bucket = new LinkedHashMap<>();
        bucket.put("revenue", BigDecimal.ZERO);
        bucket.put("cost", BigDecimal.ZERO);
        return bucket;
    }

    private void aggregateRevenueByMonth(Long tenantId, LocalDate start, LocalDate end, Map<String, Map<String, BigDecimal>> buckets) {
        // 出货对账：按 paidAt 月份
        try {
            LambdaQueryWrapper<ShipmentReconciliation> qw = new LambdaQueryWrapper<>();
            qw.eq(ShipmentReconciliation::getTenantId, tenantId)
              .eq(ShipmentReconciliation::getStatus, "paid")
              .ge(ShipmentReconciliation::getPaidAt, start.atStartOfDay())
              .le(ShipmentReconciliation::getPaidAt, end.atTime(23, 59, 59))
              .last("LIMIT " + QUERY_LIMIT);
            for (ShipmentReconciliation r : shipmentReconciliationService.list(qw)) {
                if (r.getPaidAt() != null) {
                    addBucket(buckets, r.getPaidAt().format(MONTH_FMT), "revenue", r.getFinalAmount());
                }
            }
        } catch (Exception e) {
            log.warn("[财务总览] 趋势-出货营收聚合失败", e);
        }
        // 电商销售：按 completeTime 月份
        try {
            LambdaQueryWrapper<EcSalesRevenue> qw = new LambdaQueryWrapper<>();
            qw.eq(EcSalesRevenue::getTenantId, tenantId)
              .in(EcSalesRevenue::getStatus, Arrays.asList("confirmed", "reconciled"))
              .ge(EcSalesRevenue::getCompleteTime, start.atStartOfDay())
              .le(EcSalesRevenue::getCompleteTime, end.atTime(23, 59, 59))
              .last("LIMIT " + QUERY_LIMIT);
            for (EcSalesRevenue r : ecSalesRevenueService.list(qw)) {
                if (r.getCompleteTime() != null) {
                    addBucket(buckets, r.getCompleteTime().format(MONTH_FMT), "revenue", r.getPayAmount());
                }
            }
        } catch (Exception e) {
            log.warn("[财务总览] 趋势-电商营收聚合失败", e);
        }
    }

    private void aggregateCostByMonth(Long tenantId, LocalDate start, LocalDate end, Map<String, Map<String, BigDecimal>> buckets) {
        // 工资：按 paymentTime 月份
        try {
            LambdaQueryWrapper<WagePayment> qw = new LambdaQueryWrapper<>();
            qw.eq(WagePayment::getTenantId, tenantId)
              .eq(WagePayment::getStatus, "success")
              .ge(WagePayment::getPaymentTime, start.atStartOfDay())
              .le(WagePayment::getPaymentTime, end.atTime(23, 59, 59))
              .last("LIMIT " + QUERY_LIMIT);
            for (WagePayment w : wagePaymentService.list(qw)) {
                if (w.getPaymentTime() != null) {
                    addBucket(buckets, w.getPaymentTime().format(MONTH_FMT), "cost", w.getAmount());
                }
            }
        } catch (Exception e) {
            log.warn("[财务总览] 趋势-工资成本聚合失败", e);
        }
        // 物料：按 approvedAt 月份
        try {
            LambdaQueryWrapper<MaterialReconciliation> qw = new LambdaQueryWrapper<>();
            qw.eq(MaterialReconciliation::getTenantId, tenantId)
              .eq(MaterialReconciliation::getDeleteFlag, 0)
              .in(MaterialReconciliation::getStatus, Arrays.asList("approved", "paid"))
              .ge(MaterialReconciliation::getApprovedAt, start.atStartOfDay())
              .le(MaterialReconciliation::getApprovedAt, end.atTime(23, 59, 59))
              .last("LIMIT " + QUERY_LIMIT);
            for (MaterialReconciliation m : materialReconciliationService.list(qw)) {
                if (m.getApprovedAt() != null) {
                    addBucket(buckets, m.getApprovedAt().format(MONTH_FMT), "cost", m.getFinalAmount());
                }
            }
        } catch (Exception e) {
            log.warn("[财务总览] 趋势-物料成本聚合失败", e);
        }
        // 费用：按 approvalTime 月份
        try {
            LambdaQueryWrapper<ExpenseReimbursement> qw = new LambdaQueryWrapper<>();
            qw.eq(ExpenseReimbursement::getTenantId, tenantId)
              .eq(ExpenseReimbursement::getDeleteFlag, 0)
              .in(ExpenseReimbursement::getStatus, Arrays.asList("approved", "paid"))
              .ge(ExpenseReimbursement::getApprovalTime, start.atStartOfDay())
              .le(ExpenseReimbursement::getApprovalTime, end.atTime(23, 59, 59))
              .last("LIMIT " + QUERY_LIMIT);
            for (ExpenseReimbursement e : expenseReimbursementService.list(qw)) {
                if (e.getApprovalTime() != null) {
                    addBucket(buckets, e.getApprovalTime().format(MONTH_FMT), "cost", e.getAmount());
                }
            }
        } catch (Exception e) {
            log.warn("[财务总览] 趋势-费用成本聚合失败", e);
        }
        // 借支：按 createTime 月份（已审批通过的）
        try {
            LambdaQueryWrapper<EmployeeAdvance> qw = new LambdaQueryWrapper<>();
            qw.eq(EmployeeAdvance::getTenantId, tenantId)
              .eq(EmployeeAdvance::getDeleteFlag, 0)
              .eq(EmployeeAdvance::getStatus, "approved")
              .ge(EmployeeAdvance::getCreateTime, start.atStartOfDay())
              .le(EmployeeAdvance::getCreateTime, end.atTime(23, 59, 59))
              .last("LIMIT " + QUERY_LIMIT);
            for (EmployeeAdvance a : employeeAdvanceService.list(qw)) {
                if (a.getCreateTime() != null) {
                    addBucket(buckets, a.getCreateTime().format(MONTH_FMT), "cost", a.getAmount());
                }
            }
        } catch (Exception e) {
            log.warn("[财务总览] 趋势-借支成本聚合失败", e);
        }
    }

    private void addBucket(Map<String, Map<String, BigDecimal>> buckets, String month, String field, BigDecimal value) {
        Map<String, BigDecimal> bucket = buckets.get(month);
        if (bucket == null || value == null) {
            return;
        }
        BigDecimal current = bucket.getOrDefault(field, BigDecimal.ZERO);
        bucket.put(field, current.add(value));
    }

    // ============================================================
    // 三、成本结构饼图
    // ============================================================

    private List<Map<String, Object>> buildCostStructure(Long tenantId, LocalDateTime start, LocalDateTime end) {
        BigDecimal wage = sumWagePaid(tenantId, start, end);
        BigDecimal material = sumMaterialCost(tenantId, start, end);
        BigDecimal expense = sumExpenseCost(tenantId, start, end);
        BigDecimal advance = sumAdvanceOutstanding(tenantId);

        List<Map<String, Object>> structure = new ArrayList<>();
        addCostItem(structure, "工资支出", wage);
        addCostItem(structure, "物料成本", material);
        addCostItem(structure, "费用支出", expense);
        addCostItem(structure, "员工借支", advance);
        return structure;
    }

    private void addCostItem(List<Map<String, Object>> structure, String type, BigDecimal value) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", type);
        item.put("value", value != null ? value : BigDecimal.ZERO);
        structure.add(item);
    }

    // ============================================================
    // 四、明细列表（每类 top 10）
    // ============================================================

    private Map<String, Object> buildDetails(Long tenantId, LocalDateTime start, LocalDateTime end) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("revenue", buildRevenueDetails(tenantId, start, end));
        details.put("payable", buildPayableDetails(tenantId));
        details.put("wage", buildWageDetails(tenantId, start, end));
        details.put("material", buildMaterialDetails(tenantId, start, end));
        details.put("expense", buildExpenseDetails(tenantId, start, end));
        details.put("advance", buildAdvanceDetails(tenantId));
        return details;
    }

    private List<Map<String, Object>> buildRevenueDetails(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<Map<String, Object>> list = new ArrayList<>();
        // 出货对账已收
        try {
            LambdaQueryWrapper<ShipmentReconciliation> qw = new LambdaQueryWrapper<>();
            qw.eq(ShipmentReconciliation::getTenantId, tenantId)
              .eq(ShipmentReconciliation::getStatus, "paid")
              .ge(ShipmentReconciliation::getPaidAt, start)
              .le(ShipmentReconciliation::getPaidAt, end)
              .orderByDesc(ShipmentReconciliation::getPaidAt)
              .last("LIMIT " + DETAIL_LIMIT);
            for (ShipmentReconciliation r : shipmentReconciliationService.list(qw)) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("source", "出货对账");
                item.put("orderNo", r.getOrderNo());
                item.put("customerName", r.getCustomerName());
                item.put("amount", r.getFinalAmount());
                item.put("time", r.getPaidAt() != null ? r.getPaidAt().format(DAY_FMT) : "");
                list.add(item);
            }
        } catch (Exception e) {
            log.warn("[财务总览] 营收明细-出货查询失败", e);
        }
        // 电商销售已确认
        try {
            LambdaQueryWrapper<EcSalesRevenue> qw = new LambdaQueryWrapper<>();
            qw.eq(EcSalesRevenue::getTenantId, tenantId)
              .in(EcSalesRevenue::getStatus, Arrays.asList("confirmed", "reconciled"))
              .ge(EcSalesRevenue::getCompleteTime, start)
              .le(EcSalesRevenue::getCompleteTime, end)
              .orderByDesc(EcSalesRevenue::getCompleteTime)
              .last("LIMIT " + DETAIL_LIMIT);
            for (EcSalesRevenue r : ecSalesRevenueService.list(qw)) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("source", "电商销售-" + (r.getPlatform() != null ? r.getPlatform() : ""));
                item.put("orderNo", r.getEcOrderNo());
                item.put("customerName", r.getShopName());
                item.put("amount", r.getPayAmount());
                item.put("time", r.getCompleteTime() != null ? r.getCompleteTime().format(DAY_FMT) : "");
                list.add(item);
            }
        } catch (Exception e) {
            log.warn("[财务总览] 营收明细-电商查询失败", e);
        }
        return list;
    }

    private List<Map<String, Object>> buildPayableDetails(Long tenantId) {
        try {
            LambdaQueryWrapper<Payable> qw = new LambdaQueryWrapper<>();
            qw.eq(Payable::getTenantId, tenantId)
              .eq(Payable::getDeleteFlag, 0)
              .in(Payable::getStatus, Arrays.asList("PENDING", "PARTIAL", "OVERDUE"))
              .orderByDesc(Payable::getCreateTime)
              .last("LIMIT " + DETAIL_LIMIT);
            return payableService.list(qw).stream().map(p -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("payableNo", p.getPayableNo());
                item.put("supplierName", p.getSupplierName());
                item.put("amount", p.getAmount());
                item.put("paidAmount", p.getPaidAmount());
                BigDecimal outstanding = (p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO)
                        .subtract(p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO);
                item.put("outstanding", outstanding);
                item.put("status", p.getStatus());
                item.put("dueDate", p.getDueDate() != null ? p.getDueDate().toString() : "");
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[财务总览] 应付明细查询失败", e);
            return Collections.emptyList();
        }
    }

    private List<Map<String, Object>> buildWageDetails(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<WagePayment> qw = new LambdaQueryWrapper<>();
            qw.eq(WagePayment::getTenantId, tenantId)
              .eq(WagePayment::getStatus, "success")
              .ge(WagePayment::getPaymentTime, start)
              .le(WagePayment::getPaymentTime, end)
              .orderByDesc(WagePayment::getPaymentTime)
              .last("LIMIT " + DETAIL_LIMIT);
            return wagePaymentService.list(qw).stream().map(w -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("paymentNo", w.getPaymentNo());
                item.put("payeeName", w.getPayeeName());
                item.put("bizType", w.getBizType());
                item.put("amount", w.getAmount());
                item.put("paymentMethod", w.getPaymentMethod());
                item.put("time", w.getPaymentTime() != null ? w.getPaymentTime().format(DAY_FMT) : "");
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[财务总览] 工资明细查询失败", e);
            return Collections.emptyList();
        }
    }

    private List<Map<String, Object>> buildMaterialDetails(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<MaterialReconciliation> qw = new LambdaQueryWrapper<>();
            qw.eq(MaterialReconciliation::getTenantId, tenantId)
              .eq(MaterialReconciliation::getDeleteFlag, 0)
              .in(MaterialReconciliation::getStatus, Arrays.asList("approved", "paid"))
              .ge(MaterialReconciliation::getApprovedAt, start)
              .le(MaterialReconciliation::getApprovedAt, end)
              .orderByDesc(MaterialReconciliation::getApprovedAt)
              .last("LIMIT " + DETAIL_LIMIT);
            return materialReconciliationService.list(qw).stream().map(m -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("reconciliationNo", m.getReconciliationNo());
                item.put("supplierName", m.getSupplierName());
                item.put("materialName", m.getMaterialName());
                item.put("finalAmount", m.getFinalAmount());
                item.put("status", m.getStatus());
                item.put("time", m.getApprovedAt() != null ? m.getApprovedAt().format(DAY_FMT) : "");
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[财务总览] 物料明细查询失败", e);
            return Collections.emptyList();
        }
    }

    private List<Map<String, Object>> buildExpenseDetails(Long tenantId, LocalDateTime start, LocalDateTime end) {
        try {
            LambdaQueryWrapper<ExpenseReimbursement> qw = new LambdaQueryWrapper<>();
            qw.eq(ExpenseReimbursement::getTenantId, tenantId)
              .eq(ExpenseReimbursement::getDeleteFlag, 0)
              .in(ExpenseReimbursement::getStatus, Arrays.asList("approved", "paid"))
              .ge(ExpenseReimbursement::getApprovalTime, start)
              .le(ExpenseReimbursement::getApprovalTime, end)
              .orderByDesc(ExpenseReimbursement::getApprovalTime)
              .last("LIMIT " + DETAIL_LIMIT);
            return expenseReimbursementService.list(qw).stream().map(e -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("reimbursementNo", e.getReimbursementNo());
                item.put("applicantName", e.getApplicantName());
                item.put("expenseType", e.getExpenseType());
                item.put("title", e.getTitle());
                item.put("amount", e.getAmount());
                item.put("status", e.getStatus());
                item.put("time", e.getApprovalTime() != null ? e.getApprovalTime().format(DAY_FMT) : "");
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[财务总览] 费用明细查询失败", e);
            return Collections.emptyList();
        }
    }

    private List<Map<String, Object>> buildAdvanceDetails(Long tenantId) {
        try {
            LambdaQueryWrapper<EmployeeAdvance> qw = new LambdaQueryWrapper<>();
            qw.eq(EmployeeAdvance::getTenantId, tenantId)
              .eq(EmployeeAdvance::getDeleteFlag, 0)
              .ne(EmployeeAdvance::getRepaymentStatus, "repaid")
              .orderByDesc(EmployeeAdvance::getCreateTime)
              .last("LIMIT " + DETAIL_LIMIT);
            return employeeAdvanceService.list(qw).stream().map(a -> {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("advanceNo", a.getAdvanceNo());
                item.put("employeeName", a.getEmployeeName());
                item.put("amount", a.getAmount());
                item.put("remainingAmount", a.getRemainingAmount());
                item.put("repaymentStatus", a.getRepaymentStatus());
                item.put("time", a.getCreateTime() != null ? a.getCreateTime().format(DAY_FMT) : "");
                return item;
            }).collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("[财务总览] 借支明细查询失败", e);
            return Collections.emptyList();
        }
    }

    // ============================================================
    // 工具方法
    // ============================================================

    private LocalDate parseDateOrDefault(String date, LocalDate defaultDate) {
        if (date == null || date.trim().isEmpty()) {
            return defaultDate;
        }
        try {
            return LocalDate.parse(date);
        } catch (Exception e) {
            return defaultDate;
        }
    }

    private int safeCount(java.util.function.Supplier<Long> supplier) {
        try {
            Long count = supplier.get();
            return count != null ? count.intValue() : 0;
        } catch (Exception e) {
            log.warn("[财务总览] 计数查询失败", e);
            return 0;
        }
    }

    private Map<String, Object> buildEmptyDashboard() {
        Map<String, Object> result = new LinkedHashMap<>();
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalRevenue", BigDecimal.ZERO);
        summary.put("accountsPayable", BigDecimal.ZERO);
        summary.put("wageExpense", BigDecimal.ZERO);
        summary.put("materialCost", BigDecimal.ZERO);
        summary.put("expenseCost", BigDecimal.ZERO);
        summary.put("advanceAmount", BigDecimal.ZERO);
        summary.put("totalCost", BigDecimal.ZERO);
        summary.put("netProfit", BigDecimal.ZERO);
        summary.put("pendingApprovals", 0);
        summary.put("overdueCount", 0);
        result.put("summary", summary);
        result.put("revenueTrend", Collections.emptyList());
        result.put("costStructure", Collections.emptyList());
        result.put("details", Collections.emptyMap());
        return result;
    }
}
