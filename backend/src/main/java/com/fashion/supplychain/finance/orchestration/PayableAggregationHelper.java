package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.PayableItemDTO;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.WagePaymentRequest;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class PayableAggregationHelper {

    private final MaterialReconciliationService materialReconciliationService;
    private final ExpenseReimbursementService expenseReimbursementService;
    private final WagePaymentService wagePaymentService;
    private final BillAggregationService billAggregationService;
    private final WagePaymentCallbackHelper callbackHelper;

    private static final AtomicLong PAYMENT_SEQ = new AtomicLong(1);

    public List<PayableItemDTO> listPendingPayables(String bizType) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();
        List<PayableItemDTO> items = new ArrayList<>();

        if (bizType == null || "RECONCILIATION".equals(bizType)) {
            items.addAll(queryReconciliationPayables(tenantId));
        }
        if (bizType == null || "REIMBURSEMENT".equals(bizType)) {
            items.addAll(queryReimbursementPayables(tenantId));
        }
        if (bizType == null || "PAYROLL_SETTLEMENT".equals(bizType)) {
            items.addAll(queryPayrollSettlementPayables(tenantId));
        }
        if (bizType == null || "ORDER_SETTLEMENT".equals(bizType)) {
            items.addAll(queryOrderSettlementPayables(tenantId));
        }
        if (bizType == null || "BILL_RECEIVABLE".equals(bizType) || "BILL_PAYABLE".equals(bizType)) {
            items.addAll(queryBillPayables(tenantId, bizType, items));
        }

        return items;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment createPendingPayable(WagePaymentRequest request) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        String bizType = request.getBizType() != null ? request.getBizType() : "ORDER_SETTLEMENT";
        String bizId = request.getBizId();

        if (bizId != null && existsActivePayment(bizType, bizId, tenantId)) {
            WagePayment existing = findActivePayment(bizType, bizId, tenantId);
            log.info("[付款中心] 已存在有效付款记录(status={})，跳过重复创建: bizType={}, bizId={}",
                     existing.getStatus(), bizType, bizId);
            return existing;
        }

        WagePayment payment = buildPendingPayment(request, bizType, tenantId);
        wagePaymentService.save(payment);
        log.info("[付款中心] 创建待付款记录: no={}, payee={}, bizType={}, amount={}",
                 payment.getPaymentNo(), payment.getPayeeName(),
                 payment.getBizType(), payment.getAmount());

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public void rejectPayable(String paymentId, String bizType, String bizId, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        if ("PAYROLL_SETTLEMENT".equals(bizType) || "ORDER_SETTLEMENT".equals(bizType)) {
            rejectSettlementPayable(paymentId, bizType, bizId, reason, tenantId);
            return;
        }

        callbackHelper.callbackRejectUpstream(bizType, bizId, reason);
    }

    String generatePaymentNo() {
        String datePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        long seq = PAYMENT_SEQ.getAndIncrement();
        return String.format("WP%s%06d", datePart, seq);
    }

    private List<PayableItemDTO> queryReconciliationPayables(Long tenantId) {
        List<MaterialReconciliation> recons = materialReconciliationService.list(
            new LambdaQueryWrapper<MaterialReconciliation>()
                .eq(MaterialReconciliation::getTenantId, tenantId)
                .eq(MaterialReconciliation::getStatus, "approved")
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .orderByDesc(MaterialReconciliation::getCreateTime)
                .last("LIMIT 5000")
        );
        List<PayableItemDTO> items = new ArrayList<>();
        for (MaterialReconciliation r : recons) {
            items.add(PayableItemDTO.builder()
                .bizType("RECONCILIATION")
                .bizId(r.getId())
                .bizNo(r.getReconciliationNo())
                .payeeType("FACTORY")
                .payeeId(r.getSupplierId())
                .payeeName(r.getSupplierName())
                .amount(r.getFinalAmount() != null ? r.getFinalAmount() : r.getTotalAmount())
                .paidAmount(r.getPaidAmount())
                .description("物料对账 - " + r.getMaterialName())
                .sourceStatus(r.getStatus())
                .createTime(r.getCreateTime())
                .yearMonth(r.getCreateTime() != null ? r.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM")) : null)
                .build());
        }
        return items;
    }

    private List<PayableItemDTO> queryReimbursementPayables(Long tenantId) {
        List<ExpenseReimbursement> reimbs = expenseReimbursementService.list(
            new LambdaQueryWrapper<ExpenseReimbursement>()
                .eq(ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getStatus, "approved")
                .eq(ExpenseReimbursement::getDeleteFlag, 0)
                .orderByDesc(ExpenseReimbursement::getCreateTime)
                .last("LIMIT 5000")
        );
        List<PayableItemDTO> items = new ArrayList<>();
        for (ExpenseReimbursement e : reimbs) {
            items.add(PayableItemDTO.builder()
                .bizType("REIMBURSEMENT")
                .bizId(e.getId())
                .bizNo(e.getReimbursementNo())
                .payeeType("WORKER")
                .payeeId(String.valueOf(e.getApplicantId()))
                .payeeName(e.getApplicantName())
                .amount(e.getAmount())
                .paidAmount(BigDecimal.ZERO)
                .description(e.getTitle() + " - " + e.getExpenseType())
                .sourceStatus(e.getStatus())
                .createTime(e.getCreateTime())
                .yearMonth(e.getCreateTime() != null ? e.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM")) : null)
                .build());
        }
        return items;
    }

    private List<PayableItemDTO> queryPayrollSettlementPayables(Long tenantId) {
        List<PayableItemDTO> items = new ArrayList<>();
        try {
            LambdaQueryWrapper<WagePayment> psWrapper = new LambdaQueryWrapper<>();
            psWrapper.eq(WagePayment::getBizType, "PAYROLL_SETTLEMENT")
                     .eq(WagePayment::getStatus, "pending")
                     .eq(WagePayment::getTenantId, tenantId)
                     .last("LIMIT 5000");
            List<WagePayment> psPayments = wagePaymentService.list(psWrapper);
            for (WagePayment wp : psPayments) {
                items.add(PayableItemDTO.builder()
                    .bizType("PAYROLL_SETTLEMENT")
                    .bizId(wp.getBizId())
                    .bizNo(wp.getPaymentNo())
                    .payeeName(wp.getPayeeName())
                    .payeeType("PERSON")
                    .amount(wp.getAmount())
                    .sourceStatus("pending")
                    .description(wp.getPaymentRemark())
                    .createTime(wp.getCreateTime())
                    .yearMonth(wp.getCreateTime() != null ? wp.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM")) : null)
                    .build());
            }
        } catch (Exception e) {
            log.warn("[付款中心] 查询工资结算待付款失败", e);
        }
        return items;
    }

    private List<PayableItemDTO> queryOrderSettlementPayables(Long tenantId) {
        List<PayableItemDTO> items = new ArrayList<>();
        try {
            LambdaQueryWrapper<WagePayment> osWrapper = new LambdaQueryWrapper<>();
            osWrapper.eq(WagePayment::getBizType, "ORDER_SETTLEMENT")
                     .eq(WagePayment::getStatus, "pending")
                     .eq(WagePayment::getTenantId, tenantId)
                     .last("LIMIT 5000");
            List<WagePayment> osPayments = wagePaymentService.list(osWrapper);
            for (WagePayment wp : osPayments) {
                items.add(PayableItemDTO.builder()
                    .bizType("ORDER_SETTLEMENT")
                    .bizId(wp.getBizId())
                    .bizNo(wp.getPaymentNo())
                    .payeeName(wp.getPayeeName())
                    .payeeType("FACTORY")
                    .amount(wp.getAmount())
                    .sourceStatus("pending")
                    .description(wp.getPaymentRemark())
                    .createTime(wp.getCreateTime())
                    .yearMonth(wp.getCreateTime() != null ? wp.getCreateTime().format(DateTimeFormatter.ofPattern("yyyy-MM")) : null)
                    .build());
            }
        } catch (Exception e) {
            log.warn("[付款中心] 查询工厂订单结算待付款失败", e);
        }
        return items;
    }

    private List<PayableItemDTO> queryBillPayables(Long tenantId, String bizType, List<PayableItemDTO> existingItems) {
        List<PayableItemDTO> items = new ArrayList<>();
        try {
            Set<String> existingSources = new HashSet<>();
            for (PayableItemDTO existing : existingItems) {
                if (existing.getBizId() != null && existing.getBizType() != null) {
                    existingSources.add(existing.getBizType() + ":" + existing.getBizId());
                }
            }

            LambdaQueryWrapper<BillAggregation> billWrapper = new LambdaQueryWrapper<BillAggregation>()
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getStatus, "CONFIRMED")
                .eq(BillAggregation::getDeleteFlag, 0)
                .eq("BILL_RECEIVABLE".equals(bizType), BillAggregation::getBillType, "RECEIVABLE")
                .eq("BILL_PAYABLE".equals(bizType), BillAggregation::getBillType, "PAYABLE")
                .orderByDesc(BillAggregation::getCreateTime)
                .last("LIMIT 5000");
            List<BillAggregation> confirmedBills = billAggregationService.list(billWrapper);

            Map<String, List<BillAggregation>> grouped = confirmedBills.stream().collect(
                Collectors.groupingBy(b ->
                    String.valueOf(b.getBillType()) + "|" +
                    String.valueOf(b.getCounterpartyType()) + "|" +
                    String.valueOf(b.getCounterpartyId()) + "|" +
                    (b.getSettlementMonth() != null ? b.getSettlementMonth() : "")
                )
            );
            for (Map.Entry<String, List<BillAggregation>> entry : grouped.entrySet()) {
                List<BillAggregation> group = entry.getValue();
                List<BillAggregation> dedupedGroup = group.stream()
                    .filter(b -> !existingSources.contains(b.getSourceType() + ":" + b.getSourceId()))
                    .collect(Collectors.toList());
                if (dedupedGroup.isEmpty()) continue;
                BillAggregation first = dedupedGroup.get(0);
                BigDecimal totalAmount = dedupedGroup.stream()
                    .map(b -> b.getAmount() != null ? b.getAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
                BigDecimal settledAmt = dedupedGroup.stream()
                    .map(b -> b.getSettledAmount() != null ? b.getSettledAmount() : BigDecimal.ZERO)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
                String aggBizType = "RECEIVABLE".equals(first.getBillType()) ? "BILL_RECEIVABLE" : "BILL_PAYABLE";
                String payeeTypeStr = "RECEIVABLE".equals(first.getBillType()) ? "CUSTOMER" : "FACTORY";
                String billDesc = ("RECEIVABLE".equals(first.getBillType()) ? "应收账款" : "应付账款")
                    + " - " + dedupedGroup.size() + "笔";
                items.add(PayableItemDTO.builder()
                    .bizType(aggBizType)
                    .bizId(first.getCounterpartyId() + "_" + first.getSettlementMonth())
                    .bizNo(group.size() + "笔账单")
                    .payeeType(payeeTypeStr)
                    .payeeId(first.getCounterpartyId())
                    .payeeName(first.getCounterpartyName())
                    .amount(totalAmount)
                    .paidAmount(settledAmt)
                    .description(billDesc)
                    .sourceStatus("CONFIRMED")
                    .createTime(first.getCreateTime())
                    .yearMonth(first.getSettlementMonth())
                    .build());
            }
        } catch (Exception e) {
            log.warn("[付款中心] 查询账单汇总待收付款失败", e);
        }
        return items;
    }

    private boolean existsActivePayment(String bizType, String bizId, Long tenantId) {
        return wagePaymentService.getOne(
            new LambdaQueryWrapper<WagePayment>()
                .eq(WagePayment::getBizType, bizType)
                .eq(WagePayment::getBizId, bizId)
                .notIn(WagePayment::getStatus, "cancelled", "rejected", "failed")
                .eq(WagePayment::getTenantId, tenantId)
                .last("LIMIT 1")
        ) != null;
    }

    private WagePayment findActivePayment(String bizType, String bizId, Long tenantId) {
        return wagePaymentService.getOne(
            new LambdaQueryWrapper<WagePayment>()
                .eq(WagePayment::getBizType, bizType)
                .eq(WagePayment::getBizId, bizId)
                .notIn(WagePayment::getStatus, "cancelled", "rejected", "failed")
                .eq(WagePayment::getTenantId, tenantId)
                .last("LIMIT 1")
        );
    }

    private WagePayment buildPendingPayment(WagePaymentRequest request, String bizType, Long tenantId) {
        WagePayment payment = new WagePayment();
        payment.setPaymentNo(generatePaymentNo());
        payment.setPayeeType(request.getPayeeType() != null ? request.getPayeeType() : "FACTORY");
        payment.setPayeeId(request.getPayeeId());
        payment.setPayeeName(request.getPayeeName());
        payment.setAmount(request.getAmount());
        payment.setCurrency("CNY");
        payment.setBizType(bizType);
        payment.setBizId(request.getBizId());
        payment.setPaymentRemark(request.getRemark());
        payment.setOperatorId(UserContext.userId());
        payment.setOperatorName(UserContext.username());
        payment.setTenantId(tenantId);
        payment.setStatus("pending");
        payment.setPaymentMethod("OFFLINE");
        payment.setNotifyStatus("none");
        payment.setCreateTime(LocalDateTime.now());
        payment.setUpdateTime(LocalDateTime.now());
        return payment;
    }

    private void rejectSettlementPayable(String paymentId, String bizType, String bizId, String reason, Long tenantId) {
        if (paymentId != null) {
            rejectByPaymentId(paymentId, reason);
        } else if (bizId != null) {
            rejectByBizId(bizType, bizId, reason, tenantId);
        }

        if ("PAYROLL_SETTLEMENT".equals(bizType) && bizId != null) {
            callbackHelper.callbackPayrollSettlementRejected(bizId, tenantId);
        } else if ("ORDER_SETTLEMENT".equals(bizType) && bizId != null) {
            callbackHelper.callbackOrderSettlementRejected(bizId);
        }
    }

    private void rejectByPaymentId(String paymentId, String reason) {
        WagePayment wp = wagePaymentService.getById(paymentId);
        if (wp != null) {
            TenantAssert.assertBelongsToCurrentTenant(wp.getTenantId(), "待付款记录");
            wp.setStatus("rejected");
            wp.setPaymentRemark("【驳回】" + (reason != null ? reason : ""));
            wp.setUpdateTime(LocalDateTime.now());
            wagePaymentService.updateById(wp);
            log.info("[付款中心] 驳回待付款: id={}", paymentId);
        }
    }

    private void rejectByBizId(String bizType, String bizId, String reason, Long tenantId) {
        WagePayment wp = wagePaymentService.getOne(
            new LambdaQueryWrapper<WagePayment>()
                .eq(WagePayment::getBizType, bizType)
                .eq(WagePayment::getBizId, bizId)
                .eq(WagePayment::getStatus, "pending")
                .eq(WagePayment::getTenantId, tenantId)
                .last("LIMIT 1")
        );
        if (wp != null) {
            wp.setStatus("rejected");
            wp.setPaymentRemark("【驳回】" + (reason != null ? reason : ""));
            wp.setUpdateTime(LocalDateTime.now());
            wagePaymentService.updateById(wp);
            log.info("[付款中心] 驳回待付款(按bizId): bizType={}, bizId={}", bizType, bizId);
        }
    }
}
