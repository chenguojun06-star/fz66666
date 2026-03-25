package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.ExpenseReimbursement;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.entity.FinishedSettlementApprovalStatus;
import com.fashion.supplychain.finance.entity.PaymentAccount;
import com.fashion.supplychain.finance.entity.WagePayment;
import com.fashion.supplychain.finance.orchestration.ExpenseReimbursementOrchestrator;
import com.fashion.supplychain.finance.orchestration.WagePaymentOrchestrator;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class FinanceWorkflowTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private WagePaymentOrchestrator wagePaymentOrchestrator;
    @Autowired private ExpenseReimbursementService expenseReimbursementService;
    @Autowired private ExpenseReimbursementOrchestrator expenseReimbursementOrchestrator;
    @Autowired private FinishedProductSettlementService finishedProductSettlementService;
    @Autowired private FinishedSettlementApprovalStatusService finishedSettlementApprovalStatusService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: list_pending_payables | list_finance_approvals | list_payee_accounts | initiate_payment | confirm_offline_payment | reject_payable | approve_expense | reject_expense | approve_finished_settlement"));
        properties.put("bizType", schema("string", "业务类型，可选：RECONCILIATION / REIMBURSEMENT"));
        properties.put("bizId", schema("string", "上游单据ID"));
        properties.put("paymentId", schema("string", "支付记录ID"));
        properties.put("paymentMethod", schema("string", "支付方式：OFFLINE / BANK / WECHAT / ALIPAY"));
        properties.put("paymentAccountId", schema("string", "收款账户ID，非线下支付建议传入"));
        properties.put("proofUrl", schema("string", "线下付款凭证URL"));
        properties.put("remark", schema("string", "备注"));
        properties.put("reason", schema("string", "驳回原因"));
        properties.put("ownerType", schema("string", "账户所有者类型：WORKER / FACTORY"));
        properties.put("ownerId", schema("string", "账户所有者ID"));
        properties.put("reimbursementId", schema("string", "报销单ID"));
        properties.put("settlementId", schema("string", "成品结算单ID"));
        properties.put("limit", schema("integer", "列表条数，默认 10"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理财务常见审批和付款中心动作。支持查看待付款、查看待审批报销与成品结算、直接批准/驳回报销、批准成品结算、发起付款、确认线下付款、驳回付款项。用户说“帮我看看财务待审批”“把这张报销通过”“发起这张物料对账付款”时必须调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        Map<String, Object> args = MAPPER.readValue(argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson, new TypeReference<Map<String, Object>>() {});
        String action = text(args.get("action"));
        return switch (action) {
            case "list_pending_payables" -> listPendingPayables(args);
            case "list_finance_approvals" -> listFinanceApprovals(args);
            case "list_payee_accounts" -> listPayeeAccounts(args);
            case "initiate_payment" -> initiatePayment(args);
            case "confirm_offline_payment" -> confirmOfflinePayment(args);
            case "reject_payable" -> rejectPayable(args);
            case "approve_expense" -> approveExpense(args);
            case "reject_expense" -> rejectExpense(args);
            case "approve_finished_settlement" -> approveFinishedSettlement(args);
            default -> "{\"error\":\"不支持的 action\"}";
        };
    }

    @Override
    public String getName() {
        return "tool_finance_workflow";
    }

    private String listPendingPayables(Map<String, Object> args) throws Exception {
        String bizType = text(args.get("bizType"));
        int limit = intOf(args.get("limit"), 10);
        List<WagePaymentOrchestrator.PayableItemDTO> items = wagePaymentOrchestrator.listPendingPayables(bizType);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "付款中心待付款共 " + items.size() + " 条");
        result.put("items", items.stream().limit(limit).map(this::toPayableDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String listFinanceApprovals(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        int limit = intOf(args.get("limit"), 10);
        List<ExpenseReimbursement> expensePending = expenseReimbursementService.list(new LambdaQueryWrapper<ExpenseReimbursement>()
                .eq(tenantId != null, ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getStatus, "pending")
                .orderByDesc(ExpenseReimbursement::getCreateTime)
                .last("LIMIT " + limit));

        List<FinishedSettlementApprovalStatus> approvedRows = finishedSettlementApprovalStatusService.list(new LambdaQueryWrapper<FinishedSettlementApprovalStatus>()
                .eq(tenantId != null, FinishedSettlementApprovalStatus::getTenantId, tenantId)
                .eq(FinishedSettlementApprovalStatus::getStatus, "approved"));
        java.util.Set<String> approvedIds = approvedRows.stream().map(FinishedSettlementApprovalStatus::getSettlementId).collect(java.util.stream.Collectors.toSet());
        List<FinishedProductSettlement> finishedPending = finishedProductSettlementService.list(new LambdaQueryWrapper<FinishedProductSettlement>()
                .eq(tenantId != null, FinishedProductSettlement::getTenantId, tenantId)
                .notIn(FinishedProductSettlement::getStatus, "cancelled", "CANCELLED", "deleted", "DELETED", "scrapped")
                .orderByDesc(FinishedProductSettlement::getCreateTime));

        List<Map<String, Object>> settlementItems = finishedPending.stream()
                .filter(item -> !approvedIds.contains(item.getOrderId()))
                .limit(limit)
                .map(this::toSettlementDto)
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "财务待审批：报销 " + expensePending.size() + " 条，成品结算 " + settlementItems.size() + " 条");
        result.put("expensePending", expensePending.stream().map(this::toExpenseDto).toList());
        result.put("finishedSettlementPending", settlementItems);
        return MAPPER.writeValueAsString(result);
    }

    private String listPayeeAccounts(Map<String, Object> args) throws Exception {
        String ownerType = required(args, "ownerType");
        String ownerId = required(args, "ownerId");
        List<PaymentAccount> accounts = wagePaymentOrchestrator.listAccounts(ownerType, ownerId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "可用收款账户 " + accounts.size() + " 个");
        result.put("accounts", accounts.stream().map(this::toAccountDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String initiatePayment(Map<String, Object> args) throws Exception {
        String bizId = required(args, "bizId");
        String paymentMethod = required(args, "paymentMethod");
        WagePaymentOrchestrator.PayableItemDTO payable = findPayable(text(args.get("bizType")), bizId);
        String paymentAccountId = text(args.get("paymentAccountId"));
        if (!"OFFLINE".equalsIgnoreCase(paymentMethod) && !StringUtils.hasText(paymentAccountId)) {
            List<PaymentAccount> accounts = wagePaymentOrchestrator.listAccounts(payable.getPayeeType(), payable.getPayeeId());
            if (!accounts.isEmpty()) {
                paymentAccountId = accounts.get(0).getId();
            }
        }
        WagePaymentOrchestrator.WagePaymentRequest request = WagePaymentOrchestrator.WagePaymentRequest.builder()
                .payeeType(payable.getPayeeType())
                .payeeId(payable.getPayeeId())
                .payeeName(payable.getPayeeName())
                .paymentAccountId(paymentAccountId)
                .paymentMethod(paymentMethod)
                .amount(payable.getAmount())
                .bizType(payable.getBizType())
                .bizId(payable.getBizId())
                .bizNo(payable.getBizNo())
                .remark(text(args.get("remark")))
                .build();
        WagePayment payment = wagePaymentOrchestrator.initiatePaymentWithCallback(request);
        return ok("已发起付款", Map.of("payment", toPaymentDto(payment), "payable", toPayableDto(payable)));
    }

    private String confirmOfflinePayment(Map<String, Object> args) throws Exception {
        String paymentId = required(args, "paymentId");
        WagePayment payment = wagePaymentOrchestrator.confirmOfflineWithCallback(paymentId, text(args.get("proofUrl")), text(args.get("remark")));
        return ok("已确认线下付款", Map.of("payment", toPaymentDto(payment)));
    }

    private String rejectPayable(Map<String, Object> args) throws Exception {
        String bizId = required(args, "bizId");
        String reason = required(args, "reason");
        WagePaymentOrchestrator.PayableItemDTO payable = findPayable(text(args.get("bizType")), bizId);
        wagePaymentOrchestrator.rejectPayable(text(args.get("paymentId")), payable.getBizType(), payable.getBizId(), reason);
        return ok("已驳回待付款项", Map.of("bizId", payable.getBizId(), "bizType", payable.getBizType(), "reason", reason));
    }

    private String approveExpense(Map<String, Object> args) throws Exception {
        String reimbursementId = required(args, "reimbursementId");
        ExpenseReimbursement entity = expenseReimbursementOrchestrator.approveReimbursement(reimbursementId, "approve", text(args.get("remark")));
        return ok("已通过报销审批", Map.of("expense", toExpenseDto(entity)));
    }

    private String rejectExpense(Map<String, Object> args) throws Exception {
        String reimbursementId = required(args, "reimbursementId");
        String reason = required(args, "reason");
        ExpenseReimbursement entity = expenseReimbursementOrchestrator.approveReimbursement(reimbursementId, "reject", reason);
        return ok("已驳回报销审批", Map.of("expense", toExpenseDto(entity)));
    }

    private String approveFinishedSettlement(Map<String, Object> args) throws Exception {
        String settlementId = required(args, "settlementId");
        FinishedProductSettlement settlement = finishedProductSettlementService.getById(settlementId);
        if (settlement == null) {
            throw new IllegalArgumentException("成品结算单不存在");
        }
        Long tenantId = settlement.getTenantId() != null ? settlement.getTenantId() : UserContext.tenantId();
        finishedSettlementApprovalStatusService.markApproved(settlementId, tenantId, UserContext.userId(), UserContext.username());
        return ok("已通过成品结算审批", Map.of("settlement", toSettlementDto(settlement)));
    }

    private WagePaymentOrchestrator.PayableItemDTO findPayable(String bizType, String bizId) {
        return wagePaymentOrchestrator.listPendingPayables(bizType).stream()
                .filter(item -> bizId.equals(item.getBizId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("未找到待付款单据"));
    }

    private Map<String, Object> toPayableDto(WagePaymentOrchestrator.PayableItemDTO item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("bizType", item.getBizType());
        dto.put("bizId", item.getBizId());
        dto.put("bizNo", item.getBizNo());
        dto.put("payeeType", item.getPayeeType());
        dto.put("payeeId", item.getPayeeId());
        dto.put("payeeName", item.getPayeeName());
        dto.put("amount", item.getAmount());
        dto.put("paidAmount", item.getPaidAmount());
        dto.put("description", item.getDescription());
        dto.put("sourceStatus", item.getSourceStatus());
        return dto;
    }

    private Map<String, Object> toExpenseDto(ExpenseReimbursement item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("reimbursementNo", item.getReimbursementNo());
        dto.put("applicantName", item.getApplicantName());
        dto.put("amount", item.getAmount());
        dto.put("status", item.getStatus());
        dto.put("expenseType", item.getExpenseType());
        return dto;
    }

    private Map<String, Object> toSettlementDto(FinishedProductSettlement item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("settlementId", item.getOrderId());
        dto.put("orderNo", item.getOrderNo());
        dto.put("factoryName", item.getFactoryName());
        dto.put("styleNo", item.getStyleNo());
        dto.put("status", item.getStatus());
        dto.put("totalAmount", item.getTotalAmount());
        return dto;
    }

    private Map<String, Object> toAccountDto(PaymentAccount item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("ownerName", item.getOwnerName());
        dto.put("accountType", item.getAccountType());
        dto.put("accountName", item.getAccountName());
        dto.put("bankName", item.getBankName());
        dto.put("isDefault", item.getIsDefault());
        return dto;
    }

    private Map<String, Object> toPaymentDto(WagePayment item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("paymentNo", item.getPaymentNo());
        dto.put("status", item.getStatus());
        dto.put("payeeName", item.getPayeeName());
        dto.put("amount", item.getAmount());
        dto.put("paymentMethod", item.getPaymentMethod());
        dto.put("bizType", item.getBizType());
        dto.put("bizId", item.getBizId());
        return dto;
    }

    private String ok(String summary, Map<String, Object> payload) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", summary);
        result.putAll(payload);
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> schema(String type, String description) {
        Map<String, Object> field = new LinkedHashMap<>();
        field.put("type", type);
        field.put("description", description);
        return field;
    }

    private String required(Map<String, Object> args, String key) {
        String value = text(args.get(key));
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("缺少参数: " + key);
        }
        return value;
    }

    private String text(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private int intOf(Object value, int def) {
        if (value == null) return def;
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return def;
        }
    }
}
