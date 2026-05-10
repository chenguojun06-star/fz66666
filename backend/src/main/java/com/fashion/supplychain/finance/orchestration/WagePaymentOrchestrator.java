package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.PaymentAccount;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.service.PaymentAccountService;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.websocket.service.WebSocketService;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class WagePaymentOrchestrator {

    private final PaymentAccountService paymentAccountService;
    private final WagePaymentService wagePaymentService;
    private final WebSocketService webSocketService;
    private final WagePaymentCallbackHelper callbackHelper;
    private final PayableAggregationHelper payableAggregationHelper;
    private final PayableService payableService;
    private final BillAggregationService billAggregationService;
    private final WagePaymentDashboardHelper dashboardHelper;
    private final PaymentNoGenerator paymentNoGenerator;

    public List<PaymentAccount> listAccounts(String ownerType, String ownerId) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        return paymentAccountService.list(
            new LambdaQueryWrapper<PaymentAccount>()
                .eq(PaymentAccount::getOwnerType, ownerType)
                .eq(PaymentAccount::getOwnerId, ownerId)
                .eq(PaymentAccount::getTenantId, tenantId)
                .eq(PaymentAccount::getStatus, "active")
                .orderByDesc(PaymentAccount::getIsDefault)
                .orderByDesc(PaymentAccount::getCreateTime)
        );
    }

    @Transactional(rollbackFor = Exception.class)
    public PaymentAccount saveAccount(PaymentAccount account) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        account.setTenantId(tenantId);
        account.setCreateBy(UserContext.userId());

        if (account.getIsDefault() != null && account.getIsDefault() == 1) {
            paymentAccountService.update(
                new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<PaymentAccount>()
                    .eq(PaymentAccount::getOwnerType, account.getOwnerType())
                    .eq(PaymentAccount::getOwnerId, account.getOwnerId())
                    .eq(PaymentAccount::getTenantId, tenantId)
                    .set(PaymentAccount::getIsDefault, 0)
            );
        }

        long existCount = paymentAccountService.count(
            new LambdaQueryWrapper<PaymentAccount>()
                .eq(PaymentAccount::getOwnerType, account.getOwnerType())
                .eq(PaymentAccount::getOwnerId, account.getOwnerId())
                .eq(PaymentAccount::getTenantId, tenantId)
                .eq(PaymentAccount::getStatus, "active")
        );
        if (existCount == 0) {
            account.setIsDefault(1);
        }

        if (account.getStatus() == null) {
            account.setStatus("active");
        }

        paymentAccountService.saveOrUpdate(account);
        log.info("[工资支付] 保存收款账户: ownerType={}, ownerId={}, type={}",
                 account.getOwnerType(), account.getOwnerId(), account.getAccountType());
        return account;
    }

    @Transactional(rollbackFor = Exception.class)
    public void removeAccount(String accountId) {
        TenantAssert.assertTenantContext();
        TenantAssert.requireTenantId();

        PaymentAccount account = paymentAccountService.getById(accountId);
        if (account == null) {
            throw new IllegalArgumentException("收款账户不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(account.getTenantId(), "收款账户");

        account.setStatus("inactive");
        paymentAccountService.updateById(account);
        log.info("[工资支付] 停用收款账户: id={}", accountId);
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment initiatePayment(WagePaymentRequest request) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        WagePayment payment = new WagePayment();
        payment.setPaymentNo(generatePaymentNo());
        payment.setPayeeType(request.getPayeeType());
        payment.setPayeeId(request.getPayeeId());
        payment.setPayeeName(request.getPayeeName());
        payment.setPaymentAccountId(request.getPaymentAccountId());
        payment.setPaymentMethod(request.getPaymentMethod());
        payment.setAmount(request.getAmount());
        payment.setCurrency("CNY");
        payment.setBizType(request.getBizType());
        payment.setBizId(request.getBizId());
        payment.setBizNo(request.getBizNo());
        payment.setPaymentRemark(request.getRemark());
        payment.setOperatorId(UserContext.userId());
        payment.setOperatorName(UserContext.username());
        payment.setTenantId(tenantId);

        if ("OFFLINE".equals(request.getPaymentMethod())) {
            payment.setStatus("success");
            payment.setPaymentTime(LocalDateTime.now());
            payment.setNotifyStatus("pending");
        } else {
            payment.setStatus("pending");
            payment.setNotifyStatus("pending");
        }

        payment.setCreateTime(LocalDateTime.now());
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.save(payment);
        log.info("[工资支付] 创建支付记录: no={}, payee={}, method={}, amount={}",
                 payment.getPaymentNo(), payment.getPayeeName(),
                 payment.getPaymentMethod(), payment.getAmount());

        notifyPaymentCreated(payment);

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment confirmOfflinePayment(String paymentId, String proofUrl, String remark) {
        TenantAssert.assertTenantContext();

        WagePayment payment = wagePaymentService.getById(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(payment.getTenantId(), "支付记录");

        payment.setStatus("success");
        payment.setPaymentTime(LocalDateTime.now());
        payment.setPaymentProof(proofUrl);
        if (remark != null) {
            payment.setPaymentRemark(remark);
        }
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.updateById(payment);
        log.info("[工资支付] 确认线下支付: id={}, no={}", paymentId, payment.getPaymentNo());

        notifyPaymentSuccess(payment);

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment confirmReceived(String paymentId) {
        TenantAssert.assertTenantContext();

        WagePayment payment = wagePaymentService.getById(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(payment.getTenantId(), "支付记录");

        payment.setConfirmTime(LocalDateTime.now());
        payment.setConfirmBy(UserContext.userId());
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.updateById(payment);
        log.info("[工资支付] 收款方确认收款: id={}, no={}", paymentId, payment.getPaymentNo());

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment cancelPayment(String paymentId, String reason) {
        TenantAssert.assertTenantContext();

        WagePayment payment = wagePaymentService.getById(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(payment.getTenantId(), "支付记录");

        if ("success".equals(payment.getStatus())) {
            throw new IllegalStateException("已支付成功的记录不能取消，请使用退回功能");
        }

        payment.setStatus("cancelled");
        payment.setPaymentRemark(reason);
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.updateById(payment);
        log.info("[工资支付] 取消支付: id={}, no={}, reason={}", paymentId, payment.getPaymentNo(), reason);

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment refundPayment(String paymentId, String reason) {
        TenantAssert.assertTenantContext();
        if (!UserContext.isSupervisorOrAbove()) {
            throw new org.springframework.security.access.AccessDeniedException("仅主管级别及以上可执行退回操作");
        }

        WagePayment payment = wagePaymentService.getById(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(payment.getTenantId(), "支付记录");

        if (!"success".equals(payment.getStatus())) {
            throw new IllegalStateException("只有已支付成功的记录可以退回，当前状态: " + payment.getStatus());
        }

        payment.setStatus("refunded");
        payment.setPaymentRemark("【退回】" + (reason != null ? reason : ""));
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.updateById(payment);
        log.info("[工资支付] 退回已付款项: id={}, no={}, reason={}, operator={}",
                 paymentId, payment.getPaymentNo(), reason, UserContext.username());

        callbackHelper.callbackRefundUpstream(payment);

        return payment;
    }

    public List<WagePayment> listPayments(WagePaymentQuery query) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        LambdaQueryWrapper<WagePayment> wrapper = new LambdaQueryWrapper<WagePayment>()
            .eq(WagePayment::getTenantId, tenantId)
            .eq(query.getPayeeType() != null, WagePayment::getPayeeType, query.getPayeeType())
            .eq(query.getPayeeId() != null, WagePayment::getPayeeId, query.getPayeeId())
            .eq(query.getStatus() != null, WagePayment::getStatus, query.getStatus())
            .eq(query.getPaymentMethod() != null, WagePayment::getPaymentMethod, query.getPaymentMethod())
            .eq(query.getBizType() != null, WagePayment::getBizType, query.getBizType())
            .like(query.getPayeeName() != null, WagePayment::getPayeeName, query.getPayeeName())
            .ge(query.getStartTime() != null, WagePayment::getCreateTime, query.getStartTime())
            .le(query.getEndTime() != null, WagePayment::getCreateTime, query.getEndTime())
            .orderByDesc(WagePayment::getCreateTime);

        String dataScope = UserContext.getDataScope();
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()
                || "own".equals(dataScope) || "self".equals(dataScope)) {
            String currentUserId = UserContext.userId();
            if (currentUserId != null) {
                wrapper.eq(WagePayment::getPayeeId, currentUserId);
            } else {
                wrapper.apply("1=0");
            }
        }

        wrapper.last("LIMIT 5000");
        return wagePaymentService.list(wrapper);
    }

    public WagePaymentDetailDTO getPaymentDetail(String paymentId) {
        TenantAssert.assertTenantContext();

        WagePayment payment = wagePaymentService.getById(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(payment.getTenantId(), "支付记录");

        PaymentAccount account = null;
        if (payment.getPaymentAccountId() != null) {
            account = paymentAccountService.getById(payment.getPaymentAccountId());
        }

        return WagePaymentDetailDTO.builder()
            .payment(payment)
            .account(account)
            .build();
    }

    public List<PayableItemDTO> listPendingPayables(String bizType) {
        return payableAggregationHelper.listPendingPayables(bizType);
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment createPendingPayable(WagePaymentRequest request) {
        return payableAggregationHelper.createPendingPayable(request);
    }

    @Transactional(rollbackFor = Exception.class)
    public void rejectPayable(String paymentId, String bizType, String bizId, String reason) {
        payableAggregationHelper.rejectPayable(paymentId, bizType, bizId, reason);
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment initiatePaymentWithCallback(WagePaymentRequest request) {
        WagePayment payment = initiatePayment(request);

        if ("success".equals(payment.getStatus())) {
            String upstreamBizType = request.getBizType();
            String upstreamBizId = request.getBizId();
            Payable payable = resolvePayableFromRequest(request);
            if (payable != null) {
                syncPayableStatusOnPaid(payable, payment.getAmount());
                if (payable.getSourceType() != null && payable.getSourceId() != null) {
                    upstreamBizType = mapSourceTypeToBizType(payable.getSourceType());
                    upstreamBizId = payable.getSourceId();
                }
            }
            if (upstreamBizType != null && upstreamBizId != null) {
                callbackHelper.callbackPaidUpstream(upstreamBizType, upstreamBizId);
            }
        }

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment confirmOfflineWithCallback(String paymentId, String proofUrl, String remark) {
        WagePayment payment = confirmOfflinePayment(paymentId, proofUrl, remark);

        if ("success".equals(payment.getStatus())) {
            String upstreamBizType = payment.getBizType();
            String upstreamBizId = payment.getBizId();
            Payable payable = resolvePayableFromPayment(payment);
            if (payable != null) {
                syncPayableStatusOnPaid(payable, payment.getAmount());
                if (payable.getSourceType() != null && payable.getSourceId() != null) {
                    upstreamBizType = mapSourceTypeToBizType(payable.getSourceType());
                    upstreamBizId = payable.getSourceId();
                }
            }
            if (upstreamBizType != null && upstreamBizId != null) {
                callbackHelper.callbackPaidUpstream(upstreamBizType, upstreamBizId);
            }
        }

        return payment;
    }

    private Payable resolvePayableFromRequest(WagePaymentRequest request) {
        if (request.getBizId() == null) return null;
        try {
            Payable p = payableService.getById(request.getBizId());
            if (p != null && p.getDeleteFlag() != null && p.getDeleteFlag() == 0) return p;
        } catch (Exception ignored) {}
        return null;
    }

    private Payable resolvePayableFromPayment(WagePayment payment) {
        if (payment.getBizId() == null) return null;
        try {
            Payable p = payableService.getById(payment.getBizId());
            if (p != null && p.getDeleteFlag() != null && p.getDeleteFlag() == 0) return p;
        } catch (Exception ignored) {}
        return null;
    }

    private void syncPayableStatusOnPaid(Payable payable, BigDecimal paymentAmount) {
        BigDecimal newPaid = (payable.getPaidAmount() != null ? payable.getPaidAmount() : BigDecimal.ZERO)
                .add(paymentAmount != null ? paymentAmount : BigDecimal.ZERO);
        payable.setPaidAmount(newPaid);
        if (payable.getAmount() != null && newPaid.compareTo(payable.getAmount()) >= 0) {
            payable.setStatus("PAID");
        } else {
            payable.setStatus("PARTIAL");
        }
        payable.setUpdateTime(LocalDateTime.now());
        payableService.updateById(payable);
        log.info("[付款中心] 同步应付单状态: payableNo={}, newStatus={}, paid={}", payable.getPayableNo(), payable.getStatus(), newPaid);

        syncLinkedBillsOnPaid(payable, newPaid);
    }

    private void syncLinkedBillsOnPaid(Payable payable, BigDecimal totalPaid) {
        if (!StringUtils.hasText(payable.getId())) return;
        try {
            List<BillAggregation> linkedBills = billAggregationService.lambdaQuery()
                    .eq(BillAggregation::getPayableId, payable.getId())
                    .eq(BillAggregation::getDeleteFlag, 0)
                    .ne(BillAggregation::getStatus, "SETTLED")
                    .ne(BillAggregation::getStatus, "CANCELLED")
                    .list();
            if (linkedBills.isEmpty()) return;

            if ("PAID".equals(payable.getStatus())) {
                for (BillAggregation bill : linkedBills) {
                    bill.setSettledAmount(bill.getAmount());
                    bill.setStatus("SETTLED");
                    bill.setSettledAt(LocalDateTime.now());
                    bill.setSettledById(UserContext.userId());
                    bill.setSettledByName(UserContext.username());
                    billAggregationService.updateById(bill);
                }
                log.info("[付款中心] 同步结清{}条关联账单: payableNo={}", linkedBills.size(), payable.getPayableNo());
            } else {
                BigDecimal billTotal = BigDecimal.ZERO;
                for (BillAggregation bill : linkedBills) {
                    billTotal = billTotal.add(bill.getAmount() != null ? bill.getAmount() : BigDecimal.ZERO);
                }
                if (billTotal.compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal ratio = totalPaid.divide(billTotal, 4, java.math.RoundingMode.HALF_UP);
                    for (BillAggregation bill : linkedBills) {
                        BigDecimal billSettled = bill.getAmount().multiply(ratio).setScale(2, java.math.RoundingMode.HALF_UP);
                        bill.setSettledAmount(billSettled);
                        bill.setStatus("SETTLING");
                        billAggregationService.updateById(bill);
                    }
                }
                log.info("[付款中心] 同步部分付款到{}条关联账单: payableNo={}, ratio={}", linkedBills.size(), payable.getPayableNo(), totalPaid);
            }
        } catch (Exception e) {
            log.warn("[付款中心] 同步关联账单失败(非致命): payableNo={}, error={}", payable.getPayableNo(), e.getMessage());
        }
    }

    private String mapSourceTypeToBizType(String sourceType) {
        if (sourceType == null) return null;
        switch (sourceType) {
            case "MATERIAL_RECONCILIATION": return "RECONCILIATION";
            case "EXPENSE_REIMBURSEMENT": return "REIMBURSEMENT";
            case "PAYROLL_SETTLEMENT": return "PAYROLL_SETTLEMENT";
            case "SHIPMENT_RECONCILIATION": return "SHIPMENT_RECONCILIATION";
            default: return sourceType;
        }
    }

    public java.util.Map<String, Object> getDashboardStats(String startDate, String endDate) {
        return dashboardHelper.getDashboardStats(startDate, endDate);
    }

    private void notifyPaymentCreated(WagePayment payment) {
        try {
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("payeeId", payment.getPayeeId());
            payload.put("payeeName", payment.getPayeeName());
            payload.put("amount", payment.getAmount());
            payload.put("paymentMethod", payment.getPaymentMethod());
            payload.put("paymentNo", payment.getPaymentNo());
            payload.put("timestamp", System.currentTimeMillis());
            webSocketService.sendToUser(payment.getPayeeId(),
                com.fashion.supplychain.websocket.enums.WebSocketMessageType.PAYMENT_CREATED,
                payload);
            payment.setNotifyStatus("sent");
            payment.setNotifyTime(LocalDateTime.now());
            wagePaymentService.updateById(payment);
        } catch (Exception e) {
            log.error("[工资支付] 通知发送失败: paymentNo={}", payment.getPaymentNo(), e);
            payment.setNotifyStatus("failed");
            wagePaymentService.updateById(payment);
        }
    }

    private void notifyPaymentSuccess(WagePayment payment) {
        try {
            java.util.Map<String, Object> payload = new java.util.HashMap<>();
            payload.put("payeeId", payment.getPayeeId());
            payload.put("payeeName", payment.getPayeeName());
            payload.put("amount", payment.getAmount());
            payload.put("paymentMethod", payment.getPaymentMethod());
            payload.put("paymentNo", payment.getPaymentNo());
            payload.put("timestamp", System.currentTimeMillis());
            webSocketService.sendToUser(payment.getPayeeId(),
                com.fashion.supplychain.websocket.enums.WebSocketMessageType.PAYMENT_SUCCESS,
                payload);
        } catch (Exception e) {
            log.error("[工资支付] 支付成功通知失败: paymentNo={}", payment.getPaymentNo(), e);
        }
    }

    private String generatePaymentNo() {
        return paymentNoGenerator.generate();
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WagePaymentRequest {
        private String payeeType;
        private String payeeId;
        private String payeeName;
        private String paymentAccountId;
        private String paymentMethod;
        private BigDecimal amount;
        private String bizType;
        private String bizId;
        private String bizNo;
        private String remark;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WagePaymentQuery {
        private String payeeType;
        private String payeeId;
        private String payeeName;
        private String status;
        private String paymentMethod;
        private String bizType;
        private LocalDateTime startTime;
        private LocalDateTime endTime;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WagePaymentDetailDTO {
        private WagePayment payment;
        private PaymentAccount account;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PayableItemDTO {
        private String bizType;
        private String bizId;
        private String bizNo;
        private String payeeType;
        private String payeeId;
        private String payeeName;
        private BigDecimal amount;
        private BigDecimal paidAmount;
        private String description;
        private String sourceStatus;
        private LocalDateTime createTime;
        private String yearMonth;
        private String billCategory;
        private String sourceType;
        private String sourceNo;
        private String orderId;
        private String orderNo;
        private String styleNo;
        private String settlementMonth;
        private String billAggregationId;
        private Integer billCount;
    }
}
