package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.crm.entity.Receivable;
import com.fashion.supplychain.crm.service.ReceivableService;
import com.fashion.supplychain.finance.entity.*;
import com.fashion.supplychain.finance.service.*;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.*;

/**
 * 标准财务报表编排器
 * 聚合各业务模块数据，生成利润表/资产负债表/现金流量表
 */
@Slf4j
@Service
public class FinancialReportOrchestrator {

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;
    @Autowired
    private MaterialReconciliationService materialReconciliationService;
    @Autowired
    private EcSalesRevenueService ecSalesRevenueService;
    @Autowired
    private ExpenseReimbursementService expenseReimbursementService;
    @Autowired
    private PayableService payableService;
    @Autowired
    private InvoiceService invoiceService;
    @Autowired
    private ScanRecordService scanRecordService;
    /** F-2 每日资金趋势：工资实付（与顶部统计卡同口径） */
    @Autowired
    private WagePaymentService wagePaymentService;
    /** F-2 每日资金趋势：员工借支（借出发生日） */
    @Autowired
    private EmployeeAdvanceService employeeAdvanceService;
    /** F-2 每日资金趋势：物料采购发生（面辅料采购线） */
    @Autowired
    private com.fashion.supplychain.production.service.MaterialPurchaseService materialPurchaseService;

    /** D-273：每日经营流水（生产扫码/采购/物料出入库/成品出入库六类），现金流时间线数据源 */
    @Autowired
    private com.fashion.supplychain.finance.orchestration.DailyFlowOrchestrator dailyFlowOrchestrator;

    /** 财务报表仅限管理层查看，工厂账户禁止访问 */
    private void assertNotFactoryAccount() {
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            throw new org.springframework.security.access.AccessDeniedException("工厂账户无权访问财务报表");
        }
    }

    /**
     * 利润表 — 一段时间内的收入/成本/费用/利润汇总
     */
    public Map<String, Object> generateProfitLoss(LocalDate startDate, LocalDate endDate) {
        assertNotFactoryAccount();
        Long tenantId = TenantAssert.requireTenantId();
        LocalDateTime startDt = startDate.atStartOfDay();
        LocalDateTime endDt   = endDate.atTime(LocalTime.MAX);

        // 1. 收入：成品对账已确认 + EC 销售收入已确认
        BigDecimal shipmentRevenue = sumShipmentRevenue(tenantId, startDt, endDt);
        BigDecimal ecRevenue       = sumEcRevenue(tenantId, startDt, endDt);
        BigDecimal totalRevenue    = shipmentRevenue.add(ecRevenue);

        // 2. 成本：物料对账 + 工序成本（扫码结算）
        BigDecimal materialCost = sumMaterialCost(tenantId, startDt, endDt);
        BigDecimal laborCost   = sumLaborCost(tenantId, startDt, endDt);
        BigDecimal totalCost   = materialCost.add(laborCost);

        // 3. 费用：已批准的报销
        BigDecimal expenseTotal = sumExpense(tenantId, startDt, endDt);

        // 4. 税额：已开具发票的税额合计
        BigDecimal taxTotal = sumIssuedTax(tenantId, startDt, endDt);

        BigDecimal grossProfit = totalRevenue.subtract(totalCost);
        BigDecimal operatingProfit = grossProfit.subtract(expenseTotal);
        BigDecimal netProfit = operatingProfit.subtract(taxTotal);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportType", "PROFIT_LOSS");
        report.put("startDate", startDate.toString());
        report.put("endDate", endDate.toString());
        report.put("shipmentRevenue", shipmentRevenue);
        report.put("ecRevenue", ecRevenue);
        report.put("totalRevenue", totalRevenue);
        report.put("materialCost", materialCost);
        report.put("laborCost", laborCost);
        report.put("totalCost", totalCost);
        report.put("grossProfit", grossProfit);
        report.put("expenseTotal", expenseTotal);
        report.put("operatingProfit", operatingProfit);
        report.put("taxTotal", taxTotal);
        report.put("netProfit", netProfit);
        if (totalRevenue.compareTo(BigDecimal.ZERO) > 0) {
            report.put("grossMargin", grossProfit.divide(totalRevenue, 4, RoundingMode.HALF_UP));
            report.put("netMargin", netProfit.divide(totalRevenue, 4, RoundingMode.HALF_UP));
        }
        return report;
    }

    /**
     * 资产负债表（简化版）— 应收/应付/现金快照
     */
    public Map<String, Object> generateBalanceSheet(LocalDate asOfDate) {
        assertNotFactoryAccount();
        Long tenantId = TenantAssert.requireTenantId();

        // 应付余额（未结清）
        BigDecimal payableBalance = BigDecimal.ZERO;
        List<Payable> payables = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getDeleteFlag, 0)
                        .in(Payable::getStatus, "PENDING", "PARTIAL", "OVERDUE")
                        .eq(Payable::getTenantId, tenantId)
                        .last("LIMIT 5000"));
        for (Payable p : payables) {
            BigDecimal paid = p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO;
            payableBalance = payableBalance.add(p.getAmount().subtract(paid));
        }

        // 已开具发票金额（资产侧 — 应收票据）
        BigDecimal invoiceBalance = BigDecimal.ZERO;
        List<Invoice> invoices = invoiceService.list(
                new LambdaQueryWrapper<Invoice>()
                        .eq(Invoice::getDeleteFlag, 0)
                        .eq(Invoice::getStatus, "ISSUED")
                        .eq(Invoice::getTenantId, tenantId)
                        .last("LIMIT 5000"));
        for (Invoice inv : invoices) {
            invoiceBalance = invoiceBalance.add(inv.getTotalAmount() != null ? inv.getTotalAmount() : BigDecimal.ZERO);
        }

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportType", "BALANCE_SHEET");
        report.put("asOfDate", asOfDate.toString());
        report.put("invoiceBalance", invoiceBalance);
        report.put("payableBalance", payableBalance);
        report.put("netPosition", invoiceBalance.subtract(payableBalance));
        return report;
    }

    /**
     * 现金流量表（简化版）— 资金进出汇总
     */
    public Map<String, Object> generateCashFlow(LocalDate startDate, LocalDate endDate) {
        assertNotFactoryAccount();
        Long tenantId = TenantAssert.requireTenantId();
        LocalDateTime startDt = startDate.atStartOfDay();
        LocalDateTime endDt   = endDate.atTime(LocalTime.MAX);

        // 现金流入：成品结算已收款 + EC 已确认
        BigDecimal cashIn = sumShipmentRevenue(tenantId, startDt, endDt)
                .add(sumEcRevenue(tenantId, startDt, endDt));

        // 现金流出：应付已付 + 报销已付
        BigDecimal payablePaid = BigDecimal.ZERO;
        List<Payable> paidPayables = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getDeleteFlag, 0)
                        .eq(Payable::getStatus, "PAID")
                        .eq(Payable::getTenantId, tenantId)
                        .ge(Payable::getUpdateTime, startDt)
                        .le(Payable::getUpdateTime, endDt)
                        .last("LIMIT 5000"));
        for (Payable p : paidPayables) {
            payablePaid = payablePaid.add(p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO);
        }
        BigDecimal expensePaid = sumExpense(tenantId, startDt, endDt);
        BigDecimal cashOut = payablePaid.add(expensePaid);

        Map<String, Object> report = new LinkedHashMap<>();
        report.put("reportType", "CASH_FLOW");
        report.put("startDate", startDate.toString());
        report.put("endDate", endDate.toString());
        report.put("cashIn", cashIn);
        report.put("cashOut", cashOut);
        report.put("netCashFlow", cashIn.subtract(cashOut));
        report.put("payablePaid", payablePaid);
        report.put("expensePaid", expensePaid);
        report.put("points", buildCashFlowPoints(tenantId, startDate, endDate));
        return report;
    }

    /**
     * 构建按日资金分点数据（供前端图表）。
     * F-2 口径＝业务发生日，与顶部统计卡对齐：
     * - 营收：出货对账单创建（排除取消/驳回）+ 电商销售（全部状态，创建日）
     * - 工资：t_wage_payment 实付（status=success，paymentTime）
     * - 物料：t_material_reconciliation 已审/已付（approvedAt）
     * - 费用：t_expense_reimbursement 已审/已付（approvalTime）
     * - 借支：t_employee_advance 借出（createTime）
     */
    private List<Map<String, Object>> buildCashFlowPoints(Long tenantId, LocalDate startDate, LocalDate endDate) {
        List<ShipmentReconciliation> shipments = Collections.emptyList();
        try {
            shipments = shipmentReconciliationService.list(
                    new LambdaQueryWrapper<ShipmentReconciliation>()
                            .notIn(ShipmentReconciliation::getStatus, "cancelled", "rejected")
                            .eq(ShipmentReconciliation::getTenantId, tenantId)
                            .ge(ShipmentReconciliation::getCreateTime, startDate.atStartOfDay())
                            .le(ShipmentReconciliation::getCreateTime, endDate.atTime(LocalTime.MAX))
                            .last("LIMIT 5000"));
        } catch (Exception e) {
            log.warn("[现金流] 查询出货收入失败", e);
        }

        List<EcSalesRevenue> ecSales = Collections.emptyList();
        try {
            ecSales = ecSalesRevenueService.list(
                    new LambdaQueryWrapper<EcSalesRevenue>()
                            .eq(EcSalesRevenue::getTenantId, tenantId)
                            .ge(EcSalesRevenue::getCreateTime, startDate.atStartOfDay())
                            .le(EcSalesRevenue::getCreateTime, endDate.atTime(LocalTime.MAX))
                            .last("LIMIT 5000"));
        } catch (Exception e) {
            log.warn("[现金流] 查询电商收入失败", e);
        }

        List<WagePayment> wagePayments = Collections.emptyList();
        try {
            wagePayments = wagePaymentService.list(
                    new LambdaQueryWrapper<WagePayment>()
                            .eq(WagePayment::getTenantId, tenantId)
                            .eq(WagePayment::getStatus, "success")
                            .ge(WagePayment::getPaymentTime, startDate.atStartOfDay())
                            .le(WagePayment::getPaymentTime, endDate.atTime(LocalTime.MAX))
                            .last("LIMIT 5000"));
        } catch (Exception e) {
            log.warn("[现金流] 查询工资实付失败", e);
        }

        List<MaterialReconciliation> materialRecons = Collections.emptyList();
        try {
            materialRecons = materialReconciliationService.list(
                    new LambdaQueryWrapper<MaterialReconciliation>()
                            .eq(MaterialReconciliation::getTenantId, tenantId)
                            .eq(MaterialReconciliation::getDeleteFlag, 0)
                            .in(MaterialReconciliation::getStatus, Arrays.asList("approved", "paid"))
                            .ge(MaterialReconciliation::getApprovedAt, startDate.atStartOfDay())
                            .le(MaterialReconciliation::getApprovedAt, endDate.atTime(LocalTime.MAX))
                            .last("LIMIT 5000"));
        } catch (Exception e) {
            log.warn("[现金流] 查询物料成本失败", e);
        }

        List<ExpenseReimbursement> expenseList = Collections.emptyList();
        try {
            expenseList = expenseReimbursementService.list(
                    new LambdaQueryWrapper<ExpenseReimbursement>()
                            .eq(ExpenseReimbursement::getTenantId, tenantId)
                            .eq(ExpenseReimbursement::getDeleteFlag, 0)
                            .in(ExpenseReimbursement::getStatus, Arrays.asList("approved", "paid"))
                            .ge(ExpenseReimbursement::getApprovalTime, startDate.atStartOfDay())
                            .le(ExpenseReimbursement::getApprovalTime, endDate.atTime(LocalTime.MAX))
                            .last("LIMIT 5000"));
        } catch (Exception e) {
            log.warn("[现金流] 查询费用支出失败", e);
        }

        List<EmployeeAdvance> advances = Collections.emptyList();
        try {
            advances = employeeAdvanceService.list(
                    new LambdaQueryWrapper<EmployeeAdvance>()
                            .eq(EmployeeAdvance::getTenantId, tenantId)
                            .eq(EmployeeAdvance::getDeleteFlag, 0)
                            .ge(EmployeeAdvance::getCreateTime, startDate.atStartOfDay())
                            .le(EmployeeAdvance::getCreateTime, endDate.atTime(LocalTime.MAX))
                            .last("LIMIT 5000"));
        } catch (Exception e) {
            log.warn("[现金流] 查询员工借支失败", e);
        }

        LinkedHashMap<String, BigDecimal[]> dayBuckets = new LinkedHashMap<>();
        LocalDate cursor = startDate;
        while (!cursor.isAfter(endDate)) {
            // F-2: [收入, 工资, 物料, 费用, 借支]
            dayBuckets.put(cursor.toString(), new BigDecimal[]{
                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO});
            cursor = cursor.plusDays(1);
        }

        // 营收（业务发生口径）：出货对账单创建即计（排除取消/驳回）+ 电商销售全部状态
        for (ShipmentReconciliation s : shipments) {
            if (s.getCreateTime() != null && s.getFinalAmount() != null) {
                addToDayBucket(dayBuckets, s.getCreateTime().toLocalDate().toString(), 0, s.getFinalAmount());
            }
        }
        for (EcSalesRevenue e : ecSales) {
            if (e.getCreateTime() != null && e.getPayAmount() != null) {
                addToDayBucket(dayBuckets, e.getCreateTime().toLocalDate().toString(), 0, e.getPayAmount());
            }
        }
        // 工资支出：实付（与顶部统计卡同口径）
        for (WagePayment w : wagePayments) {
            if (w.getPaymentTime() != null && w.getAmount() != null) {
                addToDayBucket(dayBuckets, w.getPaymentTime().toLocalDate().toString(), 1, w.getAmount());
            }
        }
        // 物料成本：物料对账已审/已付（与顶部统计卡同口径）
        for (MaterialReconciliation m : materialRecons) {
            if (m.getApprovedAt() != null && m.getFinalAmount() != null) {
                addToDayBucket(dayBuckets, m.getApprovedAt().toLocalDate().toString(), 2, m.getFinalAmount());
            }
        }
        // 费用支出：报销已审/已付（与顶部统计卡同口径）
        for (ExpenseReimbursement er : expenseList) {
            if (er.getApprovalTime() != null && er.getAmount() != null) {
                addToDayBucket(dayBuckets, er.getApprovalTime().toLocalDate().toString(), 3, er.getAmount());
            }
        }
        // 员工借支：借出发生日
        for (EmployeeAdvance a : advances) {
            if (a.getCreateTime() != null && a.getAmount() != null) {
                addToDayBucket(dayBuckets, a.getCreateTime().toLocalDate().toString(), 4, a.getAmount());
            }
        }

        // D-273（用户拍板"流水的全部要进财务总览时间线"）：并入每日经营流水（发生日口径）——
        // 工序扫码工价→工资、物料采购→物料、成品出入库金额→营收；未审批的采购也看得见。
        try {
            List<com.fashion.supplychain.finance.dto.DailyFlowItem> flows =
                    dailyFlowOrchestrator.query(startDate, endDate, null);
            if (flows != null) {
                for (com.fashion.supplychain.finance.dto.DailyFlowItem f : flows) {
                    if (f.getFlowTime() == null || f.getAmount() == null
                            || f.getAmount().compareTo(BigDecimal.ZERO) == 0) {
                        continue;
                    }
                    String day = f.getFlowTime().toLocalDate().toString();
                    switch (String.valueOf(f.getBizType())) {
                        case "SCAN" -> addToDayBucket(dayBuckets, day, 1, f.getAmount());
                        case "PURCHASE" -> addToDayBucket(dayBuckets, day, 2, f.getAmount());
                        case "PRODUCT_INBOUND", "PRODUCT_OUTSTOCK" -> addToDayBucket(dayBuckets, day, 0, f.getAmount());
                        default -> { /* 物料出入库无金额来源，天然跳过 */ }
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[现金流] 并入每日经营流水失败（不影响已有序列）", e);
        }

        List<Map<String, Object>> points = new ArrayList<>();
        for (Map.Entry<String, BigDecimal[]> entry : dayBuckets.entrySet()) {
            BigDecimal[] b = entry.getValue();
            BigDecimal expenseTotal = b[1].add(b[2]).add(b[3]).add(b[4]);
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", entry.getKey().substring(5));
            point.put("income", b[0]);
            point.put("wage", b[1]);
            point.put("material", b[2]);
            point.put("expense", b[3]);
            point.put("advance", b[4]);
            point.put("expenseTotal", expenseTotal);
            points.add(point);
        }
        return points;
    }

    /** F-2：把金额累加到指定日期的指定类目桶（日期越界忽略） */
    private void addToDayBucket(LinkedHashMap<String, BigDecimal[]> dayBuckets, String day, int idx, BigDecimal amount) {
        BigDecimal[] bucket = dayBuckets.get(day);
        if (bucket != null && amount != null) {
            bucket[idx] = bucket[idx].add(amount);
        }
    }

    // ─── 汇总方法 ────────────────────────────────────────────────────────────

    private BigDecimal sumShipmentRevenue(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<ShipmentReconciliation> list = shipmentReconciliationService.list(
                new LambdaQueryWrapper<ShipmentReconciliation>()
                        .in(ShipmentReconciliation::getStatus, "verified", "paid")
                        .eq(ShipmentReconciliation::getTenantId, tenantId)
                        .ge(ShipmentReconciliation::getCreateTime, start)
                        .le(ShipmentReconciliation::getCreateTime, end)
                        .last("LIMIT 5000"));
        return list.stream()
                .map(s -> s.getFinalAmount() != null ? s.getFinalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumEcRevenue(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<EcSalesRevenue> list = ecSalesRevenueService.list(
                new LambdaQueryWrapper<EcSalesRevenue>()
                        .eq(EcSalesRevenue::getStatus, "confirmed")
                        .eq(EcSalesRevenue::getTenantId, tenantId)
                        .ge(EcSalesRevenue::getCreateTime, start)
                        .le(EcSalesRevenue::getCreateTime, end)
                        .last("LIMIT 5000"));
        return list.stream()
                .map(e -> e.getPayAmount() != null ? e.getPayAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumMaterialCost(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<MaterialReconciliation> list = materialReconciliationService.list(
                new LambdaQueryWrapper<MaterialReconciliation>()
                        .in(MaterialReconciliation::getStatus, "verified", "paid")
                        .eq(MaterialReconciliation::getTenantId, tenantId)
                        .ge(MaterialReconciliation::getCreateTime, start)
                        .le(MaterialReconciliation::getCreateTime, end)
                        .last("LIMIT 5000"));
        return list.stream()
                .map(m -> {
                    BigDecimal finalAmt = m.getFinalAmount();
                    if (finalAmt != null && finalAmt.compareTo(BigDecimal.ZERO) > 0) {
                        return finalAmt;
                    }
                    return m.getTotalAmount() != null ? m.getTotalAmount() : BigDecimal.ZERO;
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumExpense(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<ExpenseReimbursement> list = expenseReimbursementService.list(
                new LambdaQueryWrapper<ExpenseReimbursement>()
                        .eq(ExpenseReimbursement::getStatus, "approved")
                        .eq(ExpenseReimbursement::getDeleteFlag, 0)
                        .eq(ExpenseReimbursement::getTenantId, tenantId)
                        .ge(ExpenseReimbursement::getCreateTime, start)
                        .le(ExpenseReimbursement::getCreateTime, end)
                        .last("LIMIT 5000"));
        return list.stream()
                .map(e -> e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumIssuedTax(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<Invoice> list = invoiceService.list(
                new LambdaQueryWrapper<Invoice>()
                        .eq(Invoice::getDeleteFlag, 0)
                        .eq(Invoice::getStatus, "ISSUED")
                        .eq(Invoice::getTenantId, tenantId)
                        .ge(Invoice::getCreateTime, start)
                        .le(Invoice::getCreateTime, end)
                        .last("LIMIT 5000"));
        return list.stream()
                .map(i -> i.getTaxAmount() != null ? i.getTaxAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumLaborCost(Long tenantId, LocalDateTime start, LocalDateTime end) {
        LambdaQueryWrapper<ScanRecord> qw = new LambdaQueryWrapper<>();
        qw.eq(ScanRecord::getScanResult, "success")
          .gt(ScanRecord::getQuantity, 0)
          .eq(ScanRecord::getTenantId, tenantId)
          .isNull(ScanRecord::getFactoryId)
          .ne(ScanRecord::getScanType, "orchestration")
          .ge(ScanRecord::getScanTime, start)
          .le(ScanRecord::getScanTime, end);
        List<ScanRecord> records = scanRecordService.list(qw);
        return records.stream()
                .map(r -> {
                    if (r.getTotalAmount() != null && r.getTotalAmount().compareTo(BigDecimal.ZERO) > 0) {
                        return r.getTotalAmount();
                    }
                    if (r.getScanCost() != null && r.getScanCost().compareTo(BigDecimal.ZERO) > 0) {
                        return r.getScanCost();
                    }
                    if (r.getUnitPrice() != null && r.getQuantity() != null) {
                        return r.getUnitPrice().multiply(BigDecimal.valueOf(r.getQuantity()));
                    }
                    return BigDecimal.ZERO;
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    @Autowired
    private ReceivableService receivableService;

    public Map<String, Object> generateAgingAnalysis(String type) {
        assertNotFactoryAccount();
        Long tenantId = TenantAssert.requireTenantId();
        LocalDate today = LocalDate.now();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("reportType", "AGING_ANALYSIS");
        result.put("type", type);
        result.put("asOfDate", today.toString());

        int[][] bucketRanges = {{0, 30}, {31, 60}, {61, 90}, {91, 180}, {181, 99999}};
        String[] bucketLabels = {"0-30天", "31-60天", "61-90天", "91-180天", "180天以上"};

        List<Map<String, Object>> agingBuckets = new ArrayList<>();
        BigDecimal totalAmount = BigDecimal.ZERO;

        if ("RECEIVABLE".equals(type)) {
            List<Receivable> receivables = receivableService.list(new LambdaQueryWrapper<Receivable>()
                    .eq(Receivable::getDeleteFlag, 0)
                    .ne(Receivable::getStatus, "PAID")
                    .eq(Receivable::getTenantId, tenantId)
                    .last("LIMIT 5000"));

            for (int i = 0; i < bucketRanges.length; i++) {
                BigDecimal bucketAmount = BigDecimal.ZERO;
                int bucketCount = 0;
                for (Receivable r : receivables) {
                    if (r.getDueDate() == null) continue;
                    long daysOverdue = java.time.temporal.ChronoUnit.DAYS.between(r.getDueDate(), today);
                    if (daysOverdue < 0) continue;
                    if (daysOverdue >= bucketRanges[i][0] && daysOverdue <= bucketRanges[i][1]) {
                        BigDecimal remaining = (r.getAmount() != null ? r.getAmount() : BigDecimal.ZERO)
                                .subtract(r.getReceivedAmount() != null ? r.getReceivedAmount() : BigDecimal.ZERO);
                        bucketAmount = bucketAmount.add(remaining);
                        bucketCount++;
                    }
                }
                totalAmount = totalAmount.add(bucketAmount);
                Map<String, Object> bucketMap = new LinkedHashMap<>();
                bucketMap.put("range", bucketLabels[i]);
                bucketMap.put("amount", bucketAmount);
                bucketMap.put("count", bucketCount);
                agingBuckets.add(bucketMap);
            }
        } else {
            List<Payable> payables = payableService.list(new LambdaQueryWrapper<Payable>()
                    .eq(Payable::getDeleteFlag, 0)
                    .ne(Payable::getStatus, "PAID")
                    .eq(Payable::getTenantId, tenantId)
                    .last("LIMIT 5000"));

            for (int i = 0; i < bucketRanges.length; i++) {
                BigDecimal bucketAmount = BigDecimal.ZERO;
                int bucketCount = 0;
                for (Payable p : payables) {
                    if (p.getDueDate() == null) continue;
                    long daysOverdue = java.time.temporal.ChronoUnit.DAYS.between(p.getDueDate(), today);
                    if (daysOverdue < 0) continue;
                    if (daysOverdue >= bucketRanges[i][0] && daysOverdue <= bucketRanges[i][1]) {
                        BigDecimal remaining = (p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO)
                                .subtract(p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO);
                        bucketAmount = bucketAmount.add(remaining);
                        bucketCount++;
                    }
                }
                totalAmount = totalAmount.add(bucketAmount);
                Map<String, Object> bucketMap = new LinkedHashMap<>();
                bucketMap.put("range", bucketLabels[i]);
                bucketMap.put("amount", bucketAmount);
                bucketMap.put("count", bucketCount);
                agingBuckets.add(bucketMap);
            }
        }

        result.put("buckets", agingBuckets);
        result.put("totalAmount", totalAmount);
        return result;
    }
}
