package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.PayableItemDTO;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.WagePaymentRequest;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class PayableAggregationHelper {

    private final PayableService payableService;
    private final WagePaymentService wagePaymentService;
    private final WagePaymentCallbackHelper callbackHelper;
    private final PaymentNoGenerator paymentNoGenerator;

    private static final DateTimeFormatter YM_FMT = DateTimeFormatter.ofPattern("yyyy-MM");

    public List<PayableItemDTO> listPendingPayables(String bizType) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();
        List<PayableItemDTO> items = new ArrayList<>();

        LambdaQueryWrapper<Payable> wrapper = new LambdaQueryWrapper<Payable>()
                .eq(Payable::getTenantId, tenantId)
                .eq(Payable::getDeleteFlag, 0)
                .in(Payable::getStatus, "PENDING", "PARTIAL", "OVERDUE")
                .orderByDesc(Payable::getCreateTime)
                .last("LIMIT 5000");

        if (bizType != null) {
            switch (bizType) {
                case "RECONCILIATION":
                    wrapper.eq(Payable::getBillCategory, "MATERIAL");
                    break;
                case "REIMBURSEMENT":
                    wrapper.eq(Payable::getBillCategory, "EXPENSE");
                    break;
                case "PAYROLL_SETTLEMENT":
                    wrapper.eq(Payable::getBillCategory, "PAYROLL");
                    break;
                case "ORDER_SETTLEMENT":
                    wrapper.eq(Payable::getBillCategory, "PRODUCT");
                    break;
                case "BILL_RECEIVABLE":
                    wrapper.eq(Payable::getBillType, "RECEIVABLE");
                    break;
                case "BILL_PAYABLE":
                    wrapper.eq(Payable::getBillType, "PAYABLE");
                    break;
                default:
                    break;
            }
        }

        List<Payable> payables = payableService.list(wrapper);
        for (Payable p : payables) {
            items.add(toPayableItemDTO(p));
        }

        return items;
    }

    private PayableItemDTO toPayableItemDTO(Payable p) {
        String bizType = resolveBizType(p);
        String payeeType = resolvePayeeType(p);

        return PayableItemDTO.builder()
                .bizType(bizType)
                .bizId(p.getId())
                .bizNo(p.getPayableNo())
                .payeeType(payeeType)
                .payeeId(p.getCounterpartyId() != null ? p.getCounterpartyId() : p.getSupplierId())
                .payeeName(p.getCounterpartyName() != null ? p.getCounterpartyName() : p.getSupplierName())
                .amount(p.getAmount())
                .paidAmount(p.getPaidAmount())
                .description(p.getDescription())
                .sourceStatus(p.getStatus())
                .createTime(p.getCreateTime())
                .yearMonth(p.getSettlementMonth() != null ? p.getSettlementMonth()
                        : (p.getCreateTime() != null ? p.getCreateTime().format(YM_FMT) : null))
                .billCategory(p.getBillCategory())
                .sourceType(p.getSourceType())
                .sourceNo(p.getSourceNo())
                .orderId(p.getOrderId())
                .orderNo(p.getOrderNo())
                .styleNo(p.getStyleNo())
                .settlementMonth(p.getSettlementMonth())
                .billAggregationId(p.getBillAggregationId())
                .billCount(p.getBillCount())
                .build();
    }

    private String resolveBizType(Payable p) {
        if (p.getBillType() != null) {
            if ("RECEIVABLE".equals(p.getBillType())) return "BILL_RECEIVABLE";
            if ("PAYABLE".equals(p.getBillType())) {
                if (p.getBillCategory() != null) {
                    switch (p.getBillCategory()) {
                        case "MATERIAL": return "RECONCILIATION";
                        case "EXPENSE": return "REIMBURSEMENT";
                        case "PAYROLL": return "PAYROLL_SETTLEMENT";
                        case "PRODUCT": return "ORDER_SETTLEMENT";
                    }
                }
                return "BILL_PAYABLE";
            }
        }
        if (p.getBillCategory() != null) {
            switch (p.getBillCategory()) {
                case "MATERIAL": return "RECONCILIATION";
                case "EXPENSE": return "REIMBURSEMENT";
                case "PAYROLL": return "PAYROLL_SETTLEMENT";
                case "PRODUCT": return "ORDER_SETTLEMENT";
            }
        }
        return "BILL_PAYABLE";
    }

    private String resolvePayeeType(Payable p) {
        if (p.getCounterpartyType() != null) {
            switch (p.getCounterpartyType()) {
                case "SUPPLIER":
                case "FACTORY": return "FACTORY";
                case "WORKER": return "WORKER";
                case "CUSTOMER": return "CUSTOMER";
            }
        }
        return "FACTORY";
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
        return paymentNoGenerator.generate();
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
