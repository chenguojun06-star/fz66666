package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.PaymentAccount;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.WagePaymentDetailDTO;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.WagePaymentQuery;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.WagePaymentRequest;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator.PayableItemDTO;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.Data;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 工资支付控制器
 *
 * 端点设计：
 * - 收款账户管理：/api/finance/payment-accounts/*
 * - 工资支付操作：/api/finance/wage-payments/*
 *
 * 架构：Controller → WagePaymentOrchestrator → Service → Mapper
 */
@RestController
@RequestMapping("/api/finance")
@PreAuthorize("isAuthenticated()")
public class WagePaymentController {

    @Autowired
    private WagePaymentOrchestrator wagePaymentOrchestrator;

    @Autowired
    private FactoryService factoryService;

    // ============================================================
    // 一、收款账户管理
    // ============================================================

    /**
     * 查询收款账户列表
     * POST /api/finance/payment-accounts/list
     */
    @PreAuthorize("hasAuthority('MENU_PAYMENT_APPROVAL')")
    @PostMapping("/payment-accounts/list")
    public Result<List<PaymentAccount>> listAccounts(@RequestBody AccountQueryRequest request) {
        List<PaymentAccount> accounts = wagePaymentOrchestrator.listAccounts(
            request.getOwnerType(), request.getOwnerId()
        );
        return Result.success(accounts);
    }

    /**
     * 添加/更新收款账户
     * POST /api/finance/payment-accounts/save
     */
    @PreAuthorize("hasAuthority('PAYMENT_APPROVE')")
    @PostMapping("/payment-accounts/save")
    public Result<PaymentAccount> saveAccount(@RequestBody PaymentAccount account) {
        if (account.getOwnerType() == null || account.getOwnerId() == null) {
            return Result.fail("所有者类型和ID不能为空");
        }
        if (account.getAccountType() == null) {
            return Result.fail("账户类型不能为空");
        }
        // 银行卡必须有卡号和银行名
        if ("BANK".equals(account.getAccountType())) {
            if (account.getAccountNo() == null || account.getAccountNo().trim().isEmpty()) {
                return Result.fail("银行卡号不能为空");
            }
            if (account.getBankName() == null || account.getBankName().trim().isEmpty()) {
                return Result.fail("开户银行不能为空");
            }
        }
        // 微信/支付宝必须有二维码
        if (("WECHAT".equals(account.getAccountType()) || "ALIPAY".equals(account.getAccountType()))
                && (account.getQrCodeUrl() == null || account.getQrCodeUrl().trim().isEmpty())) {
            return Result.fail("请上传收款二维码");
        }

        PaymentAccount saved = wagePaymentOrchestrator.saveAccount(account);
        return Result.success(saved);
    }

    /**
     * 删除收款账户
     * DELETE /api/finance/payment-accounts/{id}
     */
    @PreAuthorize("hasAuthority('PAYMENT_APPROVE')")
    @DeleteMapping("/payment-accounts/{id}")
    public Result<Void> removeAccount(@PathVariable String id) {
        wagePaymentOrchestrator.removeAccount(id);
        return Result.success();
    }

    // ============================================================
    // 二、工资支付操作
    // ============================================================

    /**
     * 发起支付
     * POST /api/finance/wage-payments/initiate
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/wage-payments/initiate")
    public Result<WagePayment> initiatePayment(@RequestBody PaymentInitiateRequest request) {
        if (request.getPayeeId() == null || request.getPayeeId().trim().isEmpty()) {
            return Result.fail("收款方不能为空");
        }
        if (request.getPaymentMethod() == null || request.getPaymentMethod().trim().isEmpty()) {
            return Result.fail("请选择支付方式");
        }
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return Result.fail("支付金额必须大于0");
        }

        WagePaymentRequest paymentRequest = WagePaymentRequest.builder()
            .payeeType(request.getPayeeType())
            .payeeId(request.getPayeeId())
            .payeeName(request.getPayeeName())
            .paymentAccountId(request.getPaymentAccountId())
            .paymentMethod(request.getPaymentMethod())
            .amount(request.getAmount())
            .bizType(request.getBizType())
            .bizId(request.getBizId())
            .bizNo(request.getBizNo())
            .remark(request.getRemark())
            .build();

        WagePayment payment = wagePaymentOrchestrator.initiatePayment(paymentRequest);
        return Result.success(payment);
    }

    /**
     * 确认线下支付（上传凭证）
     * POST /api/finance/wage-payments/{id}/confirm-offline
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/wage-payments/{id}/confirm-offline")
    public Result<WagePayment> confirmOffline(
            @PathVariable String id,
            @RequestBody ConfirmOfflineRequest request) {
        WagePayment payment = wagePaymentOrchestrator.confirmOfflinePayment(
            id, request.getProofUrl(), request.getRemark()
        );
        return Result.success(payment);
    }

    /**
     * 收款方确认收到
     * POST /api/finance/wage-payments/{id}/confirm-received
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/wage-payments/{id}/confirm-received")
    public Result<WagePayment> confirmReceived(@PathVariable String id) {
        WagePayment payment = wagePaymentOrchestrator.confirmReceived(id);
        return Result.success(payment);
    }

    /**
     * 取消支付
     * POST /api/finance/wage-payments/{id}/cancel
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/wage-payments/{id}/cancel")
    public Result<WagePayment> cancelPayment(
            @PathVariable String id,
            @RequestBody CancelRequest request) {
        WagePayment payment = wagePaymentOrchestrator.cancelPayment(id, request.getReason());
        return Result.success(payment);
    }

    /**
     * 查询支付记录列表
     * POST /api/finance/wage-payments/list
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_VIEW')")
    @PostMapping("/wage-payments/list")
    public Result<List<WagePayment>> listPayments(@RequestBody PaymentQueryRequest request) {
        WagePaymentQuery query = WagePaymentQuery.builder()
            .payeeType(request.getPayeeType())
            .payeeId(request.getPayeeId())
            .payeeName(request.getPayeeName())
            .status(request.getStatus())
            .paymentMethod(request.getPaymentMethod())
            .bizType(request.getBizType())
            .startTime(request.getStartTime())
            .endTime(request.getEndTime())
            .build();

        List<WagePayment> payments = wagePaymentOrchestrator.listPayments(query);
        return Result.success(payments);
    }

    /**
     * 获取支付详情
     * GET /api/finance/wage-payments/{id}
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_VIEW')")
    @GetMapping("/wage-payments/{id}")
    public Result<WagePaymentDetailDTO> getPaymentDetail(@PathVariable String id) {
        WagePaymentDetailDTO detail = wagePaymentOrchestrator.getPaymentDetail(id);
        return Result.success(detail);
    }

    // ============================================================
    // 三、统一付款中心端点
    // ============================================================

    /**
     * 查询待付款单据列表（聚合工厂对账 + 费用报销）
     * POST /api/finance/wage-payments/pending-payables
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_VIEW')")
    @PostMapping("/wage-payments/pending-payables")
    public Result<List<PayableItemDTO>> listPendingPayables(@RequestBody(required = false) PendingPayableRequest request) {
        String bizType = request != null ? request.getBizType() : null;
        List<PayableItemDTO> items = wagePaymentOrchestrator.listPendingPayables(bizType);
        return Result.success(items);
    }

    /**
     * 发起支付并自动回写上游状态
     * POST /api/finance/wage-payments/initiate-with-callback
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/wage-payments/initiate-with-callback")
    public Result<WagePayment> initiateWithCallback(@RequestBody PaymentInitiateRequest request) {
        if (request.getPayeeId() == null || request.getPayeeId().trim().isEmpty()) {
            return Result.fail("收款方不能为空");
        }
        if (request.getPaymentMethod() == null || request.getPaymentMethod().trim().isEmpty()) {
            return Result.fail("请选择支付方式");
        }
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return Result.fail("支付金额必须大于0");
        }

        WagePaymentRequest paymentRequest = WagePaymentRequest.builder()
            .payeeType(request.getPayeeType())
            .payeeId(request.getPayeeId())
            .payeeName(request.getPayeeName())
            .paymentAccountId(request.getPaymentAccountId())
            .paymentMethod(request.getPaymentMethod())
            .amount(request.getAmount())
            .bizType(request.getBizType())
            .bizId(request.getBizId())
            .bizNo(request.getBizNo())
            .remark(request.getRemark())
            .build();

        WagePayment payment = wagePaymentOrchestrator.initiatePaymentWithCallback(paymentRequest);
        return Result.success(payment);
    }

    /**
     * 确认线下支付并回写上游
     * POST /api/finance/wage-payments/{id}/confirm-offline-with-callback
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/wage-payments/{id}/confirm-offline-with-callback")
    public Result<WagePayment> confirmOfflineWithCallback(
            @PathVariable String id,
            @RequestBody ConfirmOfflineRequest request) {
        WagePayment payment = wagePaymentOrchestrator.confirmOfflineWithCallback(
            id, request.getProofUrl(), request.getRemark()
        );
        return Result.success(payment);
    }

    /**
     * 创建待付款记录（工厂订单结算审核后调用）
     * POST /api/finance/wage-payment/create-payable
     */
    @PreAuthorize("hasAuthority('FINANCE_SETTLEMENT_APPROVE')")
    @PostMapping("/wage-payment/create-payable")
    public Result<WagePayment> createPayable(@RequestBody CreatePayableRequest request) {
        if (request.getPayeeName() == null || request.getPayeeName().trim().isEmpty()) {
            return Result.fail("收款方名称不能为空");
        }
        if (request.getAmount() == null || request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            return Result.fail("金额必须大于0");
        }

        // 内部工厂防重复结算：INTERNAL工厂按人员工资结算，不允许在订单结算中重复创建付款
        if ("ORDER_SETTLEMENT".equals(request.getBizType())) {
            String factoryId = request.getBizId();
            if (factoryId != null) {
                Factory factory = factoryService.getById(factoryId);
                if (factory != null && "INTERNAL".equals(factory.getFactoryType())) {
                    return Result.fail("本厂属于内部工厂，工人工资已通过工资结算模块按人员审核，请勿在订单结算中重复发起付款");
                }
            }
        }

        WagePaymentRequest paymentRequest = WagePaymentRequest.builder()
            .payeeType("FACTORY")
            .payeeId(request.getBizId())
            .payeeName(request.getPayeeName())
            .amount(request.getAmount())
            .bizType(request.getBizType() != null ? request.getBizType() : "ORDER_SETTLEMENT")
            .bizId(request.getBizId())
            .remark(request.getDescription())
            .build();

        WagePayment payment = wagePaymentOrchestrator.createPendingPayable(paymentRequest);
        return Result.success(payment);
    }

    /**
     * 驳回待付款项（付款中心驳回 → 回写上游状态）
     * POST /api/finance/wage-payments/reject
     */
    @PreAuthorize("hasAuthority('MENU_FINANCE_PAYROLL_APPROVAL_MANAGE')")
    @PostMapping("/wage-payments/reject")
    public Result<Void> rejectPayable(@RequestBody RejectPayableRequest request) {
        if (request.getBizType() == null || request.getBizType().trim().isEmpty()) {
            return Result.fail("业务类型不能为空");
        }
        wagePaymentOrchestrator.rejectPayable(
            request.getPaymentId(), request.getBizType(),
            request.getBizId(), request.getReason()
        );
        return Result.success();
    }

    // ============================================================
    // 四、请求DTO
    // ============================================================

    @Data
    public static class AccountQueryRequest {
        /** WORKER / FACTORY */
        private String ownerType;
        private String ownerId;
    }

    @Data
    public static class PaymentInitiateRequest {
        /** WORKER / FACTORY */
        private String payeeType;
        private String payeeId;
        private String payeeName;
        /** 选择的收款账户ID */
        private String paymentAccountId;
        /** OFFLINE / BANK / WECHAT / ALIPAY */
        private String paymentMethod;
        private BigDecimal amount;
        /** PAYROLL / RECONCILIATION / REIMBURSEMENT */
        private String bizType;
        private String bizId;
        private String bizNo;
        private String remark;
    }

    @Data
    public static class ConfirmOfflineRequest {
        private String proofUrl;
        private String remark;
    }

    @Data
    public static class CancelRequest {
        private String reason;
    }

    @Data
    public static class PaymentQueryRequest {
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
    public static class PendingPayableRequest {
        /** 按业务类型筛选: PAYROLL / RECONCILIATION / REIMBURSEMENT / ORDER_SETTLEMENT，null=全部 */
        private String bizType;
    }

    @Data
    public static class CreatePayableRequest {
        /** 业务类型: ORDER_SETTLEMENT */
        private String bizType;
        /** 业务ID（工厂ID或工厂名称） */
        private String bizId;
        /** 收款方名称（工厂名称） */
        private String payeeName;
        /** 金额 */
        private BigDecimal amount;
        /** 描述 */
        private String description;
        /** 关联订单号列表 */
        private java.util.List<String> orderNos;
    }

    @Data
    public static class RejectPayableRequest {
        /** WagePayment记录ID（PAYROLL_SETTLEMENT/ORDER_SETTLEMENT时有值） */
        private String paymentId;
        /** 业务类型 */
        private String bizType;
        /** 上游业务ID */
        private String bizId;
        /** 驳回原因 */
        private String reason;
    }
}
