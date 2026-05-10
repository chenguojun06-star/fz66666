package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
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
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class FinanceWorkflowTool extends AbstractAgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private WagePaymentOrchestrator wagePaymentOrchestrator;
    @Autowired private ExpenseReimbursementService expenseReimbursementService;
    @Autowired private ExpenseReimbursementOrchestrator expenseReimbursementOrchestrator;
    @Autowired private FinishedProductSettlementService finishedProductSettlementService;
    @Autowired private FinishedSettlementApprovalStatusService finishedSettlementApprovalStatusService;
    @Autowired private AiAgentToolAccessService toolAccessService;

    private static final Set<String> WRITE_ACTIONS = Set.of(
            "initiate_payment", "confirm_offline_payment", "reject_payable",
            "approve_expense", "reject_expense", "approve_finished_settlement", "batch_run");

    private static final int LARGE_BATCH_THRESHOLD = 5;
    private static final double LARGE_AMOUNT_THRESHOLD = 50000.0;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: list_pending_payables | list_finance_approvals | list_payee_accounts | initiate_payment | confirm_offline_payment | reject_payable | approve_expense | reject_expense | approve_finished_settlement | batch_run(批量执行)"));
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
        properties.put("entries", schema("array", "批量执行条目列表，仅 batch_run 使用。每项含 action 和对应参数"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理财务常见审批和付款中心动作。【批量操作】batch_run 用于同时处理多条审批/付款，自动校验总金额超5万或数量超5条时需确认。单条失败不影响其他条目。用户说“帮我看看财务待审批”“把这几条全通过”“批量付款这几条”时必须调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        TenantAssert.assertTenantContext();
        if (UserContext.tenantId() == null) {
            return "{\"success\":false,\"error\":\"租户上下文丢失，请重新登录\"}";
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson, new TypeReference<Map<String, Object>>() {});
        String action = text(args.get("action"));
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return "{\"success\":false,\"error\":\"该财务操作需要管理员权限\"}";
        }
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
            case "batch_run" -> batchRun(args);
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
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        int limit = intOf(args.get("limit"), 10);
        List<ExpenseReimbursement> expensePending = expenseReimbursementService.list(new LambdaQueryWrapper<ExpenseReimbursement>()
                .eq(ExpenseReimbursement::getTenantId, tenantId)
                .eq(ExpenseReimbursement::getStatus, "pending")
                .orderByDesc(ExpenseReimbursement::getCreateTime)
                .last("LIMIT " + limit));

        List<FinishedSettlementApprovalStatus> approvedRows = finishedSettlementApprovalStatusService.list(new LambdaQueryWrapper<FinishedSettlementApprovalStatus>()
                .eq(FinishedSettlementApprovalStatus::getTenantId, tenantId)
                .eq(FinishedSettlementApprovalStatus::getStatus, "approved"));
        java.util.Set<String> approvedIds = approvedRows.stream().map(FinishedSettlementApprovalStatus::getSettlementId).collect(java.util.stream.Collectors.toSet());
        List<FinishedProductSettlement> finishedPending = finishedProductSettlementService.list(new LambdaQueryWrapper<FinishedProductSettlement>()
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .notIn(FinishedProductSettlement::getStatus, "cancelled", "CANCELLED", "deleted", "DELETED", "scrapped", "SCRAPPED", "closed", "CLOSED", "archived", "ARCHIVED")
                .orderByDesc(FinishedProductSettlement::getCreateTime)
                .last("LIMIT 100"));

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
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        FinishedProductSettlement settlement = finishedProductSettlementService.lambdaQuery()
                .eq(FinishedProductSettlement::getOrderId, settlementId)
                .eq(FinishedProductSettlement::getTenantId, tenantId)
                .one();
        if (settlement == null) {
            throw new IllegalArgumentException("成品结算单不存在或无权访问");
        }
        finishedSettlementApprovalStatusService.markApproved(settlementId, tenantId, UserContext.userId(), UserContext.username());
        return ok("已通过成品结算审批", Map.of("settlement", toSettlementDto(settlement)));
    }

    @SuppressWarnings("unchecked")
    private String batchRun(Map<String, Object> args) throws Exception {
        Object entriesRaw = args.get("entries");
        if (entriesRaw == null) {
            return "{\"success\":false,\"error\":\"batch_run 需要 entries 参数（条目列表）\"}";
        }
        if (!(entriesRaw instanceof List)) {
            return "{\"success\":false,\"error\":\"entries 必须是数组\"}";
        }
        List<Map<String, Object>> entries = (List<Map<String, Object>>) entriesRaw;
        if (entries.isEmpty()) {
            return "{\"success\":false,\"error\":\"entries 不能为空\"}";
        }

        if (entries.size() > LARGE_BATCH_THRESHOLD) {
            Map<String, Object> warn = new LinkedHashMap<>();
            warn.put("success", false);
            warn.put("needsConfirmation", true);
            warn.put("warning", String.format("批量操作共 %d 条，超过安全阈值 %d 条。请确认后重试。", entries.size(), LARGE_BATCH_THRESHOLD));
            warn.put("entryCount", entries.size());
            warn.put("threshold", LARGE_BATCH_THRESHOLD);
            warn.put("instruction", "如确认无误，请明确回复「确认批量执行」后再调用 batch_run，或将条目分批（每批≤" + LARGE_BATCH_THRESHOLD + "条）");
            return MAPPER.writeValueAsString(warn);
        }

        double totalAmount = 0;
        for (Map<String, Object> entry : entries) {
            Object amount = entry.get("amount");
            if (amount instanceof Number) {
                totalAmount += ((Number) amount).doubleValue();
            }
        }
        if (totalAmount > LARGE_AMOUNT_THRESHOLD) {
            Map<String, Object> warn = new LinkedHashMap<>();
            warn.put("success", false);
            warn.put("needsConfirmation", true);
            warn.put("warning", String.format("批量操作总金额 ¥%.2f，超过安全阈值 ¥%.0f。请确认后重试。", totalAmount, LARGE_AMOUNT_THRESHOLD));
            warn.put("totalAmount", totalAmount);
            warn.put("threshold", LARGE_AMOUNT_THRESHOLD);
            warn.put("instruction", "如确认无误，请明确回复「确认金额无误」后再调用 batch_run");
            return MAPPER.writeValueAsString(warn);
        }

        List<Map<String, Object>> results = new ArrayList<>();
        int successCount = 0;
        int failCount = 0;

        for (int i = 0; i < entries.size(); i++) {
            Map<String, Object> entry = entries.get(i);
            String subAction = text(entry.get("action"));
            Map<String, Object> itemResult = new LinkedHashMap<>();
            itemResult.put("index", i);
            itemResult.put("action", subAction);
            try {
                String subResultJson = executeSingle(subAction, entry);
                Map<String, Object> subResult = MAPPER.readValue(subResultJson, new TypeReference<Map<String, Object>>() {});
                itemResult.put("success", true);
                itemResult.put("result", subResult);
                successCount++;
            } catch (Exception e) {
                itemResult.put("success", false);
                itemResult.put("error", e.getMessage());
                failCount++;
                log.warn("[FinanceBatch] 第{}条执行失败: {} - {}", i, subAction, e.getMessage());
            }
            results.add(itemResult);
        }

        Map<String, Object> batchResult = new LinkedHashMap<>();
        batchResult.put("success", failCount == 0);
        batchResult.put("mode", "batch_run");
        batchResult.put("totalEntries", entries.size());
        batchResult.put("successCount", successCount);
        batchResult.put("failCount", failCount);
        batchResult.put("totalAmount", totalAmount);
        batchResult.put("results", results);
        if (failCount > 0) {
            batchResult.put("partialFailure", true);
            batchResult.put("note", String.format("%d 条成功，%d 条失败，失败条目不影响已成功的操作", successCount, failCount));
        }
        return MAPPER.writeValueAsString(batchResult);
    }

    private String executeSingle(String action, Map<String, Object> args) throws Exception {
        return switch (action) {
            case "initiate_payment" -> initiatePayment(args);
            case "confirm_offline_payment" -> confirmOfflinePayment(args);
            case "reject_payable" -> rejectPayable(args);
            case "approve_expense" -> approveExpense(args);
            case "reject_expense" -> rejectExpense(args);
            case "approve_finished_settlement" -> approveFinishedSettlement(args);
            default -> throw new IllegalArgumentException("批量不支持的操作: " + action);
        };
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
