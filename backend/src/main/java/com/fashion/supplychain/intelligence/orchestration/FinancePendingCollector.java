package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import com.fashion.supplychain.intelligence.dto.PendingTaskDTO;
import java.util.*;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

/**
 * 财务域待办采集 — 工资结算/物料对账/费用报销
 */
@Component
@Lazy
@Slf4j
public class FinancePendingCollector {

    private static final int MAX_PER_CATEGORY = 10;

    @Autowired private PayrollSettlementOrchestrator payrollSettlementOrchestrator;
    @Autowired private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;
    @Autowired private ExpenseReimbursementService expenseReimbursementService;

    public List<PendingTaskDTO> collectPayrollSettlementTasks() {
        TenantAssert.assertTenantContext();
        Map<String, Object> params = new HashMap<>();
        params.put("tenantId", UserContext.tenantId());
        params.put("status", "pending");
        IPage<PayrollSettlement> page = payrollSettlementOrchestrator.list(params);
        List<PayrollSettlement> settlements = page != null ? page.getRecords() : List.of();
        return settlements.stream().limit(MAX_PER_CATEGORY).map(ps -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("PAY_" + ps.getId());
            dto.setTaskType("PAYROLL_SETTLEMENT");
            dto.setModule("finance");
            dto.setTitle("工资结算待审批 " + ProductionPendingCollector.safe(ps.getSettlementNo()));
            String desc = ProductionPendingCollector.safe(ps.getOrderNo());
            if (ps.getTotalAmount() != null) desc += " 金额" + ps.getTotalAmount().toPlainString();
            dto.setDescription(desc);
            dto.setOrderNo(ProductionPendingCollector.safe(ps.getOrderNo()));
            dto.setStyleNo(ProductionPendingCollector.safe(ps.getStyleNo()));
            dto.setDeepLinkPath("/finance/payroll-operator-summary");
            dto.setPriority("high");
            dto.setCreatedAt(ps.getCreateTime());
            dto.setTaskStatus("pending");
            dto.setAssigneeRole("财务人员");
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    public List<PendingTaskDTO> collectMaterialReconciliationTasks() {
        TenantAssert.assertTenantContext();
        Map<String, Object> params = new HashMap<>();
        params.put("tenantId", UserContext.tenantId());
        params.put("status", "pending");
        IPage<MaterialReconciliation> page = materialReconciliationOrchestrator.list(params);
        List<MaterialReconciliation> reconList = page != null ? page.getRecords() : List.of();
        return reconList.stream().limit(MAX_PER_CATEGORY).map(mr -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("MRC_" + mr.getId());
            dto.setTaskType("MATERIAL_RECON");
            dto.setModule("finance");
            dto.setTitle("物料对账待确认 " + ProductionPendingCollector.safe(mr.getReconciliationNo()));
            String desc = ProductionPendingCollector.safe(mr.getMaterialName()) + " " + ProductionPendingCollector.safe(mr.getSupplierName());
            if (mr.getFinalAmount() != null) desc += " " + mr.getFinalAmount().toPlainString() + "元";
            dto.setDescription(desc);
            dto.setOrderNo(ProductionPendingCollector.safe(mr.getOrderNo()));
            dto.setStyleNo(ProductionPendingCollector.safe(mr.getStyleNo()));
            dto.setDeepLinkPath("/finance/material-reconciliation");
            dto.setPriority("medium");
            dto.setCreatedAt(mr.getCreateTime());
            dto.setTaskStatus("pending");
            dto.setAssigneeRole("财务人员");
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }

    public List<PendingTaskDTO> collectExpenseReimbursementTasks() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<ExpenseReimbursement> expenses = expenseReimbursementService.lambdaQuery()
                .eq(ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getStatus, "pending")
                .eq(ExpenseReimbursement::getDeleteFlag, 0)
                .last("LIMIT " + MAX_PER_CATEGORY).list();
        return expenses.stream().map(er -> {
            PendingTaskDTO dto = new PendingTaskDTO();
            dto.setId("EXP_" + er.getId());
            dto.setTaskType("EXPENSE_REIMBURSE");
            dto.setModule("finance");
            dto.setTitle("费用报销待审批 " + ProductionPendingCollector.safe(er.getReimbursementNo()));
            String desc = ProductionPendingCollector.safe(er.getApplicantName()) + " " + ProductionPendingCollector.safe(er.getTitle());
            if (er.getAmount() != null) desc += " " + er.getAmount().toPlainString() + "元";
            dto.setDescription(desc);
            dto.setOrderNo("");
            dto.setStyleNo("");
            dto.setDeepLinkPath("/finance/expense-reimbursement");
            dto.setPriority("medium");
            dto.setCreatedAt(er.getCreateTime());
            dto.setTaskStatus("pending");
            dto.setAssigneeRole("财务人员");
            PendingTaskOrchestrator.fillCategoryMeta(dto);
            return dto;
        }).collect(Collectors.toList());
    }
}