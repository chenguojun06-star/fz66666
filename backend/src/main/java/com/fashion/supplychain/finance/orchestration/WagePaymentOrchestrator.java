package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.PaymentAccount;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.PaymentAccountService;
import com.fashion.supplychain.finance.service.WagePaymentService;
import com.fashion.supplychain.websocket.service.WebSocketService;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 工资支付编排器
 *
 * 职责：
 * 1. 收款账户管理（员工/工厂绑定银行卡、微信、支付宝二维码）
 * 2. 工资支付流程编排（选择支付方式 → 创建支付 → 通知收款方）
 * 3. 支付状态流转（pending → processing → success/failed）
 * 4. WebSocket实时通知（支付发起/支付成功通知收款方）
 *
 * 架构原则：
 * - 遵循 Controller → Orchestrator → Service → Mapper 四层架构
 * - 事务边界在此层管理
 * - 租户隔离在此层校验
 */
@Slf4j
@Service
public class WagePaymentOrchestrator {

    @Autowired
    private PaymentAccountService paymentAccountService;

    @Autowired
    private WagePaymentService wagePaymentService;

    @Autowired
    private WebSocketService webSocketService;

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private ExpenseReimbursementService expenseReimbursementService;

    private static final AtomicLong PAYMENT_SEQ = new AtomicLong(1);

    // ============================================================
    // 一、收款账户管理
    // ============================================================

    /**
     * 查询指定对象的所有收款账户
     */
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

    /**
     * 添加或更新收款账户
     */
    @Transactional(rollbackFor = Exception.class)
    public PaymentAccount saveAccount(PaymentAccount account) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        account.setTenantId(tenantId);
        account.setCreateBy(UserContext.userId());

        // 如果设为默认，先取消该所有者的其他默认
        if (account.getIsDefault() != null && account.getIsDefault() == 1) {
            paymentAccountService.update(
                new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<PaymentAccount>()
                    .eq(PaymentAccount::getOwnerType, account.getOwnerType())
                    .eq(PaymentAccount::getOwnerId, account.getOwnerId())
                    .eq(PaymentAccount::getTenantId, tenantId)
                    .set(PaymentAccount::getIsDefault, 0)
            );
        }

        // 如果是第一个账户，自动设为默认
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

    /**
     * 删除收款账户（逻辑删除）
     */
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

    // ============================================================
    // 二、工资支付流程编排
    // ============================================================

    /**
     * 发起工资支付
     *
     * 流程：
     * 1. 校验收款方和账户
     * 2. 生成支付单号
     * 3. 创建支付记录
     * 4. 通知收款方（WebSocket）
     *
     * @param request 支付请求
     * @return 支付记录
     */
    @Transactional(rollbackFor = Exception.class)
    public WagePayment initiatePayment(WagePaymentRequest request) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        // 1. 构建支付记录
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

        // 2. 根据支付方式设置初始状态
        if ("OFFLINE".equals(request.getPaymentMethod())) {
            // 线下支付 → 直接标记为已支付
            payment.setStatus("success");
            payment.setPaymentTime(LocalDateTime.now());
            payment.setNotifyStatus("pending");
        } else {
            // 线上支付 → 待支付状态
            payment.setStatus("pending");
            payment.setNotifyStatus("pending");
        }

        payment.setCreateTime(LocalDateTime.now());
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.save(payment);
        log.info("[工资支付] 创建支付记录: no={}, payee={}, method={}, amount={}",
                 payment.getPaymentNo(), payment.getPayeeName(),
                 payment.getPaymentMethod(), payment.getAmount());

        // 3. 发送WebSocket通知
        notifyPaymentCreated(payment);

        return payment;
    }

    /**
     * 确认线下支付（上传凭证）
     */
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

        // 通知收款方
        notifyPaymentSuccess(payment);

        return payment;
    }

    /**
     * 收款方确认收款
     */
    @Transactional(rollbackFor = Exception.class)
    public WagePayment confirmReceived(String paymentId) {
        TenantAssert.assertTenantContext();

        WagePayment payment = wagePaymentService.getById(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }

        payment.setConfirmTime(LocalDateTime.now());
        payment.setConfirmBy(UserContext.userId());
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.updateById(payment);
        log.info("[工资支付] 收款方确认收款: id={}, no={}", paymentId, payment.getPaymentNo());

        return payment;
    }

    /**
     * 取消支付
     */
    @Transactional(rollbackFor = Exception.class)
    public WagePayment cancelPayment(String paymentId, String reason) {
        TenantAssert.assertTenantContext();

        WagePayment payment = wagePaymentService.getById(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("支付记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(payment.getTenantId(), "支付记录");

        if ("success".equals(payment.getStatus())) {
            throw new IllegalStateException("已支付成功的记录不能取消");
        }

        payment.setStatus("cancelled");
        payment.setPaymentRemark(reason);
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.updateById(payment);
        log.info("[工资支付] 取消支付: id={}, no={}, reason={}", paymentId, payment.getPaymentNo(), reason);

        return payment;
    }

    // ============================================================
    // 三、查询
    // ============================================================

    /**
     * 查询支付记录列表
     */
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

        return wagePaymentService.list(wrapper);
    }

    /**
     * 获取支付详情（含收款账户信息）
     */
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

    // ============================================================
    // 四、WebSocket 通知
    // ============================================================

    private void notifyPaymentCreated(WagePayment payment) {
        try {
            webSocketService.broadcastPaymentNotification(
                "payment:created",
                payment.getPayeeId(),
                payment.getPayeeName(),
                payment.getAmount(),
                payment.getPaymentMethod(),
                payment.getPaymentNo()
            );
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
            webSocketService.broadcastPaymentNotification(
                "payment:success",
                payment.getPayeeId(),
                payment.getPayeeName(),
                payment.getAmount(),
                payment.getPaymentMethod(),
                payment.getPaymentNo()
            );
        } catch (Exception e) {
            log.error("[工资支付] 支付成功通知失败: paymentNo={}", payment.getPaymentNo(), e);
        }
    }

    // ============================================================
    // 五、辅助方法
    // ============================================================

    private String generatePaymentNo() {
        String datePart = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        long seq = PAYMENT_SEQ.getAndIncrement();
        return String.format("WP%s%06d", datePart, seq);
    }

    // ============================================================
    // 六、聚合待付款数据（统一付款中心核心）
    // ============================================================

    /**
     * 获取所有待付款的应付单据（已审批未付款）
     * 聚合三个来源：物料对账、费用报销（工资审批数据来自内存，前端直传）
     */
    public List<PayableItemDTO> listPendingPayables(String bizType) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();
        List<PayableItemDTO> items = new ArrayList<>();

        // 1. 物料对账（工厂对账）- status = 'approved'
        if (bizType == null || "RECONCILIATION".equals(bizType)) {
            List<MaterialReconciliation> recons = materialReconciliationService.list(
                new LambdaQueryWrapper<MaterialReconciliation>()
                    .eq(MaterialReconciliation::getTenantId, tenantId)
                    .eq(MaterialReconciliation::getStatus, "approved")
                    .eq(MaterialReconciliation::getDeleteFlag, 0)
                    .orderByDesc(MaterialReconciliation::getCreateTime)
            );
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
                    .build());
            }
        }

        // 2. 费用报销 - status = 'approved'
        if (bizType == null || "REIMBURSEMENT".equals(bizType)) {
            List<ExpenseReimbursement> reimbs = expenseReimbursementService.list(
                new LambdaQueryWrapper<ExpenseReimbursement>()
                    .eq(ExpenseReimbursement::getTenantId, tenantId)
                    .eq(ExpenseReimbursement::getStatus, "approved")
                    .eq(ExpenseReimbursement::getDeleteFlag, 0)
                    .orderByDesc(ExpenseReimbursement::getCreateTime)
            );
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
                    .build());
            }
        }

        // 3. 工资结算（PAYROLL_SETTLEMENT）：查询已创建的待付款记录
        if (bizType == null || "PAYROLL_SETTLEMENT".equals(bizType)) {
            try {
                LambdaQueryWrapper<WagePayment> psWrapper = new LambdaQueryWrapper<>();
                psWrapper.eq(WagePayment::getBizType, "PAYROLL_SETTLEMENT")
                         .eq(WagePayment::getStatus, "pending")
                         .eq(WagePayment::getTenantId, tenantId);
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
                        .build());
                }
            } catch (Exception e) {
                log.warn("[付款中心] 查询工资结算待付款失败", e);
            }
        }

        // 4. 工厂订单结算（ORDER_SETTLEMENT）：查询已创建的待付款记录
        if (bizType == null || "ORDER_SETTLEMENT".equals(bizType)) {
            try {
                LambdaQueryWrapper<WagePayment> osWrapper = new LambdaQueryWrapper<>();
                osWrapper.eq(WagePayment::getBizType, "ORDER_SETTLEMENT")
                         .eq(WagePayment::getStatus, "pending")
                         .eq(WagePayment::getTenantId, tenantId);
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
                        .build());
                }
            } catch (Exception e) {
                log.warn("[付款中心] 查询工厂订单结算待付款失败", e);
            }
        }

        return items;
    }

    /**
     * 创建待付款记录（工厂订单结算/工资结算审核后调用）
     * 状态为 pending，等待在付款中心手动支付
     * 幂等保护：相同 bizType + bizId 只允许一条 pending 记录
     */
    @Transactional(rollbackFor = Exception.class)
    public WagePayment createPendingPayable(WagePaymentRequest request) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        String bizType = request.getBizType() != null ? request.getBizType() : "ORDER_SETTLEMENT";
        String bizId = request.getBizId();

        // 幂等检查：同一 bizType + bizId 是否已有 pending 记录
        if (bizId != null) {
            long existCount = wagePaymentService.count(
                new LambdaQueryWrapper<WagePayment>()
                    .eq(WagePayment::getBizType, bizType)
                    .eq(WagePayment::getBizId, bizId)
                    .eq(WagePayment::getStatus, "pending")
                    .eq(WagePayment::getTenantId, tenantId)
            );
            if (existCount > 0) {
                log.info("[付款中心] 已存在待付款记录，跳过重复创建: bizType={}, bizId={}", bizType, bizId);
                // 返回已有记录
                return wagePaymentService.getOne(
                    new LambdaQueryWrapper<WagePayment>()
                        .eq(WagePayment::getBizType, bizType)
                        .eq(WagePayment::getBizId, bizId)
                        .eq(WagePayment::getStatus, "pending")
                        .eq(WagePayment::getTenantId, tenantId)
                        .last("LIMIT 1")
                );
            }
        }

        WagePayment payment = new WagePayment();
        payment.setPaymentNo(generatePaymentNo());
        payment.setPayeeType(request.getPayeeType() != null ? request.getPayeeType() : "FACTORY");
        payment.setPayeeId(request.getPayeeId());
        payment.setPayeeName(request.getPayeeName());
        payment.setAmount(request.getAmount());
        payment.setCurrency("CNY");
        payment.setBizType(bizType);
        payment.setBizId(bizId);
        payment.setPaymentRemark(request.getRemark());
        payment.setOperatorId(UserContext.userId());
        payment.setOperatorName(UserContext.username());
        payment.setTenantId(tenantId);
        payment.setStatus("pending");
        payment.setPaymentMethod("OFFLINE"); // 默认线下支付，后续在付款中心可变更
        payment.setNotifyStatus("none");
        payment.setCreateTime(LocalDateTime.now());
        payment.setUpdateTime(LocalDateTime.now());

        wagePaymentService.save(payment);
        log.info("[付款中心] 创建待付款记录: no={}, payee={}, bizType={}, amount={}",
                 payment.getPaymentNo(), payment.getPayeeName(),
                 payment.getBizType(), payment.getAmount());

        return payment;
    }

    /**
     * 驳回待付款记录 — 付款中心驳回
     * 将 pending 记录改为 rejected，并回写上游模块状态
     *
     * @param paymentId WagePayment 记录ID（PAYROLL_SETTLEMENT / ORDER_SETTLEMENT 的自有记录）
     * @param bizType   业务类型（RECONCILIATION / REIMBURSEMENT / PAYROLL_SETTLEMENT / ORDER_SETTLEMENT）
     * @param bizId     上游业务ID
     * @param reason    驳回原因
     */
    @Transactional(rollbackFor = Exception.class)
    public void rejectPayable(String paymentId, String bizType, String bizId, String reason) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();

        // 对于 PAYROLL_SETTLEMENT / ORDER_SETTLEMENT：有自己的 WagePayment 记录
        if ("PAYROLL_SETTLEMENT".equals(bizType) || "ORDER_SETTLEMENT".equals(bizType)) {
            if (paymentId != null) {
                WagePayment wp = wagePaymentService.getById(paymentId);
                if (wp != null) {
                    TenantAssert.assertBelongsToCurrentTenant(wp.getTenantId(), "待付款记录");
                    wp.setStatus("rejected");
                    wp.setPaymentRemark("【驳回】" + (reason != null ? reason : ""));
                    wp.setUpdateTime(LocalDateTime.now());
                    wagePaymentService.updateById(wp);
                    log.info("[付款中心] 驳回待付款: id={}, bizType={}, bizId={}", paymentId, bizType, bizId);
                }
            } else if (bizId != null) {
                // 按 bizType + bizId 查找 pending 记录并驳回
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
            return;
        }

        // 对于 RECONCILIATION / REIMBURSEMENT：直接回写上游状态
        callbackRejectUpstream(bizType, bizId, reason);
    }

    /**
     * 驳回时回写上游单据状态
     */
    private void callbackRejectUpstream(String bizType, String bizId, String reason) {
        try {
            switch (bizType) {
                case "RECONCILIATION":
                    MaterialReconciliation recon = materialReconciliationService.getById(bizId);
                    if (recon != null && "approved".equals(recon.getStatus())) {
                        recon.setStatus("rejected");
                        recon.setRemark("【付款驳回】" + (reason != null ? reason : ""));
                        recon.setUpdateBy(UserContext.username());
                        recon.setUpdateTime(LocalDateTime.now());
                        materialReconciliationService.updateById(recon);
                        log.info("[付款中心] 驳回物料对账: id={}", bizId);
                    }
                    break;

                case "REIMBURSEMENT":
                    ExpenseReimbursement reimb = expenseReimbursementService.getById(bizId);
                    if (reimb != null && "approved".equals(reimb.getStatus())) {
                        reimb.setStatus("rejected");
                        reimb.setApprovalRemark("【付款驳回】" + (reason != null ? reason : ""));
                        reimb.setUpdateBy(UserContext.username());
                        reimb.setUpdateTime(LocalDateTime.now());
                        expenseReimbursementService.updateById(reimb);
                        log.info("[付款中心] 驳回费用报销: id={}", bizId);
                    }
                    break;

                default:
                    log.warn("[付款中心] 驳回: 未知业务类型 {}", bizType);
            }
        } catch (Exception e) {
            log.error("[付款中心] 驳回回写上游失败: bizType={}, bizId={}", bizType, bizId, e);
        }
    }

    /**
     * 发起支付并回写上游状态
     *
     * 统一入口：创建支付记录 + 回写上游单据状态为 paid
     */
    @Transactional(rollbackFor = Exception.class)
    public WagePayment initiatePaymentWithCallback(WagePaymentRequest request) {
        // 1. 创建支付记录
        WagePayment payment = initiatePayment(request);

        // 2. 支付成功后回写上游状态
        if ("success".equals(payment.getStatus()) && request.getBizType() != null && request.getBizId() != null) {
            callbackUpstream(request.getBizType(), request.getBizId());
        }

        return payment;
    }

    /**
     * 确认线下支付并回写上游
     */
    @Transactional(rollbackFor = Exception.class)
    public WagePayment confirmOfflineWithCallback(String paymentId, String proofUrl, String remark) {
        WagePayment payment = confirmOfflinePayment(paymentId, proofUrl, remark);

        // 回写上游状态
        if ("success".equals(payment.getStatus()) && payment.getBizType() != null && payment.getBizId() != null) {
            callbackUpstream(payment.getBizType(), payment.getBizId());
        }

        return payment;
    }

    /**
     * 回写上游单据状态为 paid
     */
    private void callbackUpstream(String bizType, String bizId) {
        try {
            switch (bizType) {
                case "RECONCILIATION":
                    MaterialReconciliation recon = materialReconciliationService.getById(bizId);
                    if (recon != null && "approved".equals(recon.getStatus())) {
                        recon.setStatus("paid");
                        recon.setPaidAt(LocalDateTime.now());
                        recon.setUpdateBy(UserContext.username());
                        recon.setUpdateTime(LocalDateTime.now());
                        materialReconciliationService.updateById(recon);
                        log.info("[付款中心] 回写物料对账为paid: id={}, no={}", bizId, recon.getReconciliationNo());
                    }
                    break;

                case "REIMBURSEMENT":
                    ExpenseReimbursement reimb = expenseReimbursementService.getById(bizId);
                    if (reimb != null && "approved".equals(reimb.getStatus())) {
                        reimb.setStatus("paid");
                        reimb.setPaymentTime(LocalDateTime.now());
                        reimb.setPaymentBy(UserContext.username());
                        reimb.setUpdateBy(UserContext.username());
                        reimb.setUpdateTime(LocalDateTime.now());
                        expenseReimbursementService.updateById(reimb);
                        log.info("[付款中心] 回写费用报销为paid: id={}, no={}", bizId, reimb.getReimbursementNo());
                    }
                    break;

                case "PAYROLL":
                case "PAYROLL_SETTLEMENT":
                    // 工资结算 → 付款完成后无需回写（数据来源为扫码记录聚合，不修改源数据）
                    log.info("[付款中心] 工资结算付款完成: bizId={}", bizId);
                    break;

                case "ORDER_SETTLEMENT":
                    // 工厂订单结算 → 付款完成后无需回写（结算数据来自视图，不修改源数据）
                    log.info("[付款中心] 工厂订单结算付款完成: bizId={}", bizId);
                    break;

                default:
                    log.warn("[付款中心] 未知业务类型: bizType={}", bizType);
            }
        } catch (Exception e) {
            log.error("[付款中心] 回写上游状态失败: bizType={}, bizId={}", bizType, bizId, e);
            // 不抛异常——支付已创建，回写失败可人工处理
        }
    }

    // ============================================================
    // 七、内部DTO
    // ============================================================

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class WagePaymentRequest {
        /** 收款方类型: WORKER / FACTORY */
        private String payeeType;
        /** 收款方ID */
        private String payeeId;
        /** 收款方名称 */
        private String payeeName;
        /** 选择的收款账户ID（线上支付时必填） */
        private String paymentAccountId;
        /** 支付方式: OFFLINE / BANK / WECHAT / ALIPAY */
        private String paymentMethod;
        /** 支付金额 */
        private BigDecimal amount;
        /** 业务类型: PAYROLL / RECONCILIATION / REIMBURSEMENT */
        private String bizType;
        /** 关联业务ID */
        private String bizId;
        /** 关联业务单号 */
        private String bizNo;
        /** 备注 */
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

    /**
     * 待付款项目DTO — 统一付款中心用
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PayableItemDTO {
        /** 业务类型: PAYROLL / RECONCILIATION / REIMBURSEMENT */
        private String bizType;
        /** 上游单据ID */
        private String bizId;
        /** 上游单据编号 */
        private String bizNo;
        /** 收款方类型: WORKER / FACTORY */
        private String payeeType;
        /** 收款方ID */
        private String payeeId;
        /** 收款方名称 */
        private String payeeName;
        /** 应付金额 */
        private BigDecimal amount;
        /** 已付金额 */
        private BigDecimal paidAmount;
        /** 描述信息 */
        private String description;
        /** 上游单据状态 */
        private String sourceStatus;
        /** 创建时间 */
        private LocalDateTime createTime;
    }
}
