package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.entity.DeductionItem;
import com.fashion.supplychain.finance.entity.PaymentAccount;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.finance.service.PaymentAccountService;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import com.fashion.supplychain.finance.helper.WagePaymentLogAppendHelper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import org.springframework.util.StringUtils;
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
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class WagePaymentOrchestrator {

    private final PaymentAccountService paymentAccountService;
    private final WagePaymentService wagePaymentService;
    private final WagePaymentCallbackHelper callbackHelper;
    private final PayableAggregationHelper payableAggregationHelper;
    private final PayableService payableService;
    private final BillAggregationService billAggregationService;
    private final WagePaymentDashboardHelper dashboardHelper;
    private final PaymentNoGenerator paymentNoGenerator;
    private final WagePaymentLogAppendHelper logAppendHelper;

    // D-643：收款方解析/搜索与扣款项标记从 WagePaymentController 下沉，收敛 ArchUnit 规则6
    private final FactoryService factoryService;
    private final UserService userService;
    private final DeductionItemMapper deductionItemMapper;

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
        Long tenantId = TenantAssert.requireTenantId();

        PaymentAccount account = paymentAccountService.lambdaQuery()
                .eq(PaymentAccount::getId, accountId)
                .eq(PaymentAccount::getTenantId, tenantId)
                .one();
        if (account == null) {
            throw new IllegalArgumentException("收款账户不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(account.getTenantId(), "收款账户");

        account.setStatus("inactive");
        paymentAccountService.updateById(account);
        log.info("[工资支付] 停用收款账户: id={}", accountId);
        logAppendHelper.appendRemoveAccount(account.getOwnerId(), account.getOwnerType(), accountId);
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment initiatePayment(WagePaymentRequest request) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        // 幂等防重：同一业务单据+支付方式只允许创建一条非取消的支付记录
        long existCount = wagePaymentService.count(
            new LambdaQueryWrapper<WagePayment>()
                .eq(WagePayment::getTenantId, tenantId)
                .eq(WagePayment::getBizType, request.getBizType())
                .eq(WagePayment::getBizId, request.getBizId())
                .eq(WagePayment::getPaymentMethod, request.getPaymentMethod())
                .ne(WagePayment::getStatus, "cancelled")
        );
        if (existCount > 0) {
            throw new IllegalStateException("该单据已存在支付记录，请勿重复提交");
        }

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
        logAppendHelper.appendInitiatePayment(payment.getId(),
                payment.getAmount() != null ? payment.getAmount().toString() : "0",
                payment.getPaymentMethod());

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment confirmOfflinePayment(String paymentId, String proofUrl, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WagePayment payment = wagePaymentService.lambdaQuery()
                .eq(WagePayment::getId, paymentId)
                .eq(WagePayment::getTenantId, tenantId)
                .one();
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

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment confirmReceived(String paymentId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WagePayment payment = wagePaymentService.lambdaQuery()
                .eq(WagePayment::getId, paymentId)
                .eq(WagePayment::getTenantId, tenantId)
                .one();
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(payment.getTenantId(), "支付记录");

        payment.setConfirmTime(LocalDateTime.now());
        payment.setConfirmBy(UserContext.userId());
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.updateById(payment);
        log.info("[工资支付] 收款方确认收款: id={}, no={}", paymentId, payment.getPaymentNo());
        logAppendHelper.appendConfirmReceived(payment.getId(), payment.getPaymentNo());

        return payment;
    }

    @Transactional(rollbackFor = Exception.class)
    public WagePayment cancelPayment(String paymentId, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        WagePayment payment = wagePaymentService.lambdaQuery()
                .eq(WagePayment::getId, paymentId)
                .eq(WagePayment::getTenantId, tenantId)
                .one();
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
        Long tenantId = UserContext.tenantId();

        WagePayment payment = wagePaymentService.lambdaQuery()
                .eq(WagePayment::getId, paymentId)
                .eq(WagePayment::getTenantId, tenantId)
                .one();
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
        Long tenantId = UserContext.tenantId();

        WagePayment payment = wagePaymentService.lambdaQuery()
                .eq(WagePayment::getId, paymentId)
                .eq(WagePayment::getTenantId, tenantId)
                .one();
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

    public List<PayableItemDTO> listPendingPayables(String bizType, String startDate, String endDate) {
        return payableAggregationHelper.listPendingPayables(bizType, startDate, endDate);
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
                } else {
                    // 合并应付不携带单一 source：应付结清时按合并分组特征反查组内账单，
                    // 逐张回写上游业务单（未结清不回写，避免部分付款误标上游已付）
                    callbackMergedPayableBillsIfSettled(payable);
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

    /**
     * 合并应付结清后的上游回写：按 findMergedPayable 的同构分组特征
     * （billType + billCategory + counterpartyId + settlementMonth，空值按 isNull 匹配）
     * 反查组内非取消账单，逐张回写上游业务单状态。
     */
    private void callbackMergedPayableBillsIfSettled(Payable payable) {
        try {
            boolean settled = payable.getPaidAmount() != null && payable.getAmount() != null
                    && payable.getPaidAmount().compareTo(payable.getAmount()) >= 0;
            if (!settled) {
                return;
            }
            Long tenantId = UserContext.tenantId();
            var wrapper = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<BillAggregation>()
                    .eq(BillAggregation::getTenantId, tenantId)
                    .eq(BillAggregation::getDeleteFlag, 0)
                    .ne(BillAggregation::getStatus, "CANCELLED")
                    .eq(BillAggregation::getBillType, payable.getBillType())
                    .eq(BillAggregation::getBillCategory, payable.getBillCategory());
            if (org.springframework.util.StringUtils.hasText(payable.getCounterpartyId())) {
                wrapper.eq(BillAggregation::getCounterpartyId, payable.getCounterpartyId());
            } else {
                wrapper.isNull(BillAggregation::getCounterpartyId);
            }
            if (org.springframework.util.StringUtils.hasText(payable.getSettlementMonth())) {
                wrapper.eq(BillAggregation::getSettlementMonth, payable.getSettlementMonth());
            } else {
                wrapper.isNull(BillAggregation::getSettlementMonth);
            }
            java.util.List<BillAggregation> bills = billAggregationService.list(wrapper);
            for (BillAggregation bill : bills) {
                if (org.springframework.util.StringUtils.hasText(bill.getSourceType())
                        && org.springframework.util.StringUtils.hasText(bill.getSourceId())) {
                    callbackHelper.callbackPaidUpstream(mapSourceTypeToBizType(bill.getSourceType()), bill.getSourceId());
                }
            }
            log.info("[付款中心] 合并应付结清回写: payableNo={}, 组内账单 {} 张", payable.getPayableNo(), bills.size());
        } catch (Exception e) {
            log.warn("[付款中心] 合并应付结清回写失败(不阻断): payableNo={}", payable.getPayableNo(), e);
        }
    }

    private Payable resolvePayableFromRequest(WagePaymentRequest request) {
        if (request.getBizId() == null) return null;
        try {
            Long tenantId = UserContext.tenantId();
            Payable p = payableService.lambdaQuery()
                    .eq(Payable::getId, request.getBizId())
                    .eq(Payable::getTenantId, tenantId)
                    .one();
            if (p != null && p.getDeleteFlag() != null && p.getDeleteFlag() == 0) return p;
        } catch (Exception e) {
            log.warn("[付款中心] 查询应付单失败: bizId={}", request.getBizId(), e);
        }
        return null;
    }

    private Payable resolvePayableFromPayment(WagePayment payment) {
        if (payment.getBizId() == null) return null;
        try {
            Long tenantId = UserContext.tenantId();
            Payable p = payableService.lambdaQuery()
                    .eq(Payable::getId, payment.getBizId())
                    .eq(Payable::getTenantId, tenantId)
                    .one();
            if (p != null && p.getDeleteFlag() != null && p.getDeleteFlag() == 0) return p;
        } catch (Exception e) {
            log.warn("[付款中心] 查询应付单失败: bizId={}", payment.getBizId(), e);
        }
        return null;
    }

    private void syncPayableStatusOnPaid(Payable payable, BigDecimal paymentAmount) {
        BigDecimal delta = paymentAmount != null ? paymentAmount : BigDecimal.ZERO;
        Long tenantId = UserContext.tenantId();
        int rows = payableService.atomicAddPaidAmount(payable.getId(), delta, tenantId);
        if (rows == 0) {
            log.warn("[付款中心] 原子更新应付单失败: payableId={}", payable.getId());
            return;
        }
        Payable refreshed = payableService.lambdaQuery()
                .eq(Payable::getId, payable.getId())
                .eq(Payable::getTenantId, tenantId)
                .one();
        BigDecimal newPaid = refreshed != null ? refreshed.getPaidAmount() : BigDecimal.ZERO;
        log.info("[付款中心] 同步应付单状态: payableNo={}, newStatus={}, paid={}", payable.getPayableNo(), refreshed != null ? refreshed.getStatus() : "UNKNOWN", newPaid);

        syncLinkedBillsOnPaid(refreshed != null ? refreshed : payable, newPaid);
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

    // ============================================================
    //  收款方解析 / 搜索 / 扣款标记（D-643 从 WagePaymentController 下沉）
    // ============================================================

    /**
     * 判定 {@code bizId} 指向的工厂是否为「内部工厂」。
     *
     * <p>内部工厂按人员工资结算，不允许在订单结算里重复发起付款。
     * 先按 ID 查（UUID），查不到再按工厂名兜底（历史数据里 factoryId 为空时 bizId = factoryName）。
     *
     * @return true 表示是内部工厂，调用方应阻断
     */
    public boolean isInternalFactory(String bizId) {
        if (!StringUtils.hasText(bizId)) {
            return false;
        }
        Factory factory = factoryService.getById(bizId);
        if (factory != null) {
            TenantAssert.assertBelongsToCurrentTenant(factory.getTenantId(), "工厂");
        }
        if (factory == null) {
            factory = factoryService.getOne(new LambdaQueryWrapper<Factory>()
                    .eq(Factory::getFactoryName, bizId)
                    .eq(Factory::getDeleteFlag, 0)
                    .last("limit 1"));
        }
        return factory != null && "INTERNAL".equals(factory.getFactoryType());
    }

    /**
     * 解析 / 校验收款方名称。
     *
     * <p>WORKER 按 userId 反查姓名，FACTORY 按工厂 ID 反查工厂名，
     * 两者都会做跨租户校验（{@link TenantAssert}）。查不到返回 {@code null}，
     * 由调用方决定是否阻断（原逻辑即如此，不在此处抛异常）。
     *
     * @return 解析出的名称；WORKER/FACTORY 查不到时返回 null；其他类型原样返回 payeeName
     */
    public String resolvePayeeName(String payeeType, String payeeId, String payeeName) {
        if (payeeType == null || payeeId == null) {
            return null;
        }
        if ("WORKER".equals(payeeType)) {
            try {
                Long uid = Long.valueOf(payeeId);
                User user = userService.getById(uid);
                if (user != null) {
                    TenantAssert.assertBelongsToCurrentTenant(user.getTenantId(), "员工");
                    return user.getName() != null ? user.getName() : user.getUsername();
                }
            } catch (NumberFormatException e) {
                log.warn("[WagePayment] 解析收款方ID失败: {}", e.getMessage());
            }
            return null;
        }
        if ("FACTORY".equals(payeeType)) {
            Factory factory = factoryService.getById(payeeId);
            if (factory != null) {
                TenantAssert.assertBelongsToCurrentTenant(factory.getTenantId(), "工厂");
                if (factory.getDeleteFlag() != null && factory.getDeleteFlag() == 0) {
                    return factory.getFactoryName();
                }
            }
            return null;
        }
        return payeeName;
    }

    /**
     * 收款方搜索（员工 / 工厂）。
     *
     * <p>工厂账号只能搜到自己工厂，不能搜员工或其他工厂 —— 该数据权限在编排层落实，
     * 避免调用方漏判。
     *
     * @param keyword          关键词（调用方需先 trim；空关键词由调用方提前返回空列表）
     * @param payeeType        可选 WORKER / FACTORY，null 表示两者都搜
     * @param tenantId         当前租户 ID
     * @param ctxFactoryId     当前工厂账号绑定的工厂 ID
     * @param isFactoryAccount 是否工厂账号
     */
    public List<PayeeSearchResult> searchPayee(String keyword, String payeeType,
                                               Long tenantId, String ctxFactoryId,
                                               boolean isFactoryAccount) {
        List<PayeeSearchResult> results = new ArrayList<>();

        if (isFactoryAccount) {
            if (ctxFactoryId == null) {
                return results;
            }
            if (payeeType == null || "FACTORY".equals(payeeType)) {
                Factory factory = factoryService.getById(ctxFactoryId);
                if (factory != null) {
                    TenantAssert.assertBelongsToCurrentTenant(factory.getTenantId(), "工厂");
                }
                if (factory != null && factory.getDeleteFlag() != null && factory.getDeleteFlag() == 0) {
                    String fn = factory.getFactoryName();
                    if (fn != null && fn.toLowerCase().contains(keyword.toLowerCase())) {
                        results.add(new PayeeSearchResult(factory.getId(), "FACTORY",
                                factory.getFactoryName(), factory.getContactPhone(), "工厂"));
                    }
                }
            }
            return results;
        }

        if (payeeType == null || "WORKER".equals(payeeType)) {
            QueryWrapper<User> userQw = new QueryWrapper<>();
            if (tenantId != null) userQw.eq("tenant_id", tenantId);
            userQw.eq("status", "active")
                  .and(w -> w.like("name", keyword).or().like("username", keyword).or().like("phone", keyword))
                  .last("LIMIT 20");
            for (User u : userService.list(userQw)) {
                results.add(new PayeeSearchResult(String.valueOf(u.getId()), "WORKER",
                        u.getName() != null ? u.getName() : u.getUsername(),
                        u.getPhone(), "员工"));
            }
        }

        if (payeeType == null || "FACTORY".equals(payeeType)) {
            QueryWrapper<Factory> factoryQw = new QueryWrapper<>();
            if (tenantId != null) factoryQw.eq("tenant_id", tenantId);
            factoryQw.eq("delete_flag", 0)
                     .and(w -> w.like("factory_name", keyword).or().like("contact_person", keyword).or().like("factory_code", keyword))
                     .last("LIMIT 20");
            for (Factory f : factoryService.list(factoryQw)) {
                results.add(new PayeeSearchResult(f.getId(), "FACTORY",
                        f.getFactoryName(), f.getContactPhone(), "工厂"));
            }
        }

        return results;
    }

    /**
     * D-136：把本次纳入抵扣的扣款项标记 {@code settle_flag=1}。
     * 未勾选/超出的扣款保持未抵扣 → 下期工厂汇总自动滚存。
     *
     * <p>标记失败不影响主流程（仅告警），故此处吞异常。
     */
    public void markDeductionsSettled(List<String> deductionIds, String payeeName) {
        if (deductionIds == null || deductionIds.isEmpty()) {
            return;
        }
        try {
            DeductionItem patch = new DeductionItem();
            patch.setSettleFlag(1);
            deductionItemMapper.update(patch, new LambdaQueryWrapper<DeductionItem>()
                    .in(DeductionItem::getId, deductionIds));
            log.info("[终审推送] 已标记{}条扣款项为已抵扣: factory={}", deductionIds.size(), payeeName);
        } catch (Exception e) {
            log.warn("[终审推送] 扣款抵扣标记失败(不影响推送): factory={}, err={}", payeeName, e.getMessage());
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

    /** 收款方搜索结果（D-643 从 WagePaymentController 迁入，避免编排层反向依赖 Controller） */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PayeeSearchResult {
        private String id;
        private String payeeType;
        private String name;
        private String phone;
        private String label;
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
