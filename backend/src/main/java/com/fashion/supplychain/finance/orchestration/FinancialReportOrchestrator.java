package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.*;
import com.fashion.supplychain.finance.service.*;
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
        Long tenantId = UserContext.tenantId();
        LocalDateTime startDt = startDate.atStartOfDay();
        LocalDateTime endDt   = endDate.atTime(LocalTime.MAX);

        // 1. 收入：成品对账已确认 + EC 销售收入已确认
        BigDecimal shipmentRevenue = sumShipmentRevenue(tenantId, startDt, endDt);
        BigDecimal ecRevenue       = sumEcRevenue(tenantId, startDt, endDt);
        BigDecimal totalRevenue    = shipmentRevenue.add(ecRevenue);

        // 2. 成本：物料对账 + 工序成本（扫码结算）
        BigDecimal materialCost = sumMaterialCost(tenantId, startDt, endDt);

        // 3. 费用：已批准的报销
        BigDecimal expenseTotal = sumExpense(tenantId, startDt, endDt);

        // 4. 税额：已开具发票的税额合计
        BigDecimal taxTotal = sumIssuedTax(tenantId, startDt, endDt);

        BigDecimal grossProfit = totalRevenue.subtract(materialCost);
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
        Long tenantId = UserContext.tenantId();

        // 应付余额（未结清）
        BigDecimal payableBalance = BigDecimal.ZERO;
        List<Payable> payables = payableService.list(
                new LambdaQueryWrapper<Payable>()
                        .eq(Payable::getDeleteFlag, 0)
                        .in(Payable::getStatus, "PENDING", "PARTIAL", "OVERDUE")
                        .eq(tenantId != null, Payable::getTenantId, tenantId));
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
                        .eq(tenantId != null, Invoice::getTenantId, tenantId));
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
        Long tenantId = UserContext.tenantId();
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
                        .eq(tenantId != null, Payable::getTenantId, tenantId)
                        .ge(Payable::getUpdateTime, startDt)
                        .le(Payable::getUpdateTime, endDt));
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
        return report;
    }

    // ─── 汇总方法 ────────────────────────────────────────────────────────────

    private BigDecimal sumShipmentRevenue(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<ShipmentReconciliation> list = shipmentReconciliationService.list(
                new LambdaQueryWrapper<ShipmentReconciliation>()
                        .in(ShipmentReconciliation::getStatus, "verified", "paid")
                        .eq(tenantId != null, ShipmentReconciliation::getTenantId, tenantId)
                        .ge(ShipmentReconciliation::getCreateTime, start)
                        .le(ShipmentReconciliation::getCreateTime, end));
        return list.stream()
                .map(s -> s.getFinalAmount() != null ? s.getFinalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumEcRevenue(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<EcSalesRevenue> list = ecSalesRevenueService.list(
                new LambdaQueryWrapper<EcSalesRevenue>()
                        .eq(EcSalesRevenue::getStatus, "confirmed")
                        .eq(tenantId != null, EcSalesRevenue::getTenantId, tenantId)
                        .ge(EcSalesRevenue::getCreateTime, start)
                        .le(EcSalesRevenue::getCreateTime, end));
        return list.stream()
                .map(e -> e.getPayAmount() != null ? e.getPayAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumMaterialCost(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<MaterialReconciliation> list = materialReconciliationService.list(
                new LambdaQueryWrapper<MaterialReconciliation>()
                        .in(MaterialReconciliation::getStatus, "verified", "paid")
                        .eq(tenantId != null, MaterialReconciliation::getTenantId, tenantId)
                        .ge(MaterialReconciliation::getCreateTime, start)
                        .le(MaterialReconciliation::getCreateTime, end));
        return list.stream()
                .map(m -> m.getTotalAmount() != null ? m.getTotalAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumExpense(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<ExpenseReimbursement> list = expenseReimbursementService.list(
                new LambdaQueryWrapper<ExpenseReimbursement>()
                        .eq(ExpenseReimbursement::getStatus, "approved")
                        .eq(ExpenseReimbursement::getDeleteFlag, 0)
                        .eq(tenantId != null, ExpenseReimbursement::getTenantId, tenantId)
                        .ge(ExpenseReimbursement::getCreateTime, start)
                        .le(ExpenseReimbursement::getCreateTime, end));
        return list.stream()
                .map(e -> e.getAmount() != null ? e.getAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumIssuedTax(Long tenantId, LocalDateTime start, LocalDateTime end) {
        List<Invoice> list = invoiceService.list(
                new LambdaQueryWrapper<Invoice>()
                        .eq(Invoice::getDeleteFlag, 0)
                        .eq(Invoice::getStatus, "ISSUED")
                        .eq(tenantId != null, Invoice::getTenantId, tenantId)
                        .ge(Invoice::getCreateTime, start)
                        .le(Invoice::getCreateTime, end));
        return list.stream()
                .map(i -> i.getTaxAmount() != null ? i.getTaxAmount() : BigDecimal.ZERO)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
}
