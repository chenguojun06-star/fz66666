package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.orchestration.ReconciliationStatusOrchestrator;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchRequest;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchResponse;
import com.fashion.supplychain.intelligence.orchestration.CollaborationDispatchOrchestrator;
import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class MaterialReconciliationTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired private MaterialReconciliationService materialReconciliationService;
    @Autowired private ReconciliationStatusOrchestrator reconciliationStatusOrchestrator;
    @Autowired private CollaborationDispatchOrchestrator collaborationDispatchOrchestrator;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: list_material_reconciliation | update_status | return_previous | explain_exception | dispatch_followup"));
        properties.put("reconciliationId", schema("string", "物料对账单ID"));
        properties.put("status", schema("string", "目标状态，可用值：pending / verified / approved / paid / rejected"));
        properties.put("reason", schema("string", "退回或驳回原因"));
        properties.put("keyword", schema("string", "按对账单号/供应商/物料名模糊过滤"));
        properties.put("orderNo", schema("string", "按订单号过滤"));
        properties.put("sourceType", schema("string", "采购来源过滤：order / sample"));
        properties.put("limit", schema("integer", "列表条数，默认 10"));
        properties.put("targetRole", schema("string", "派发岗位，可选：财务、采购、跟单、仓库"));
        properties.put("instruction", schema("string", "补充派发要求，可选"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理物料对账链路。支持查看对账单、更新状态、退回上一步、解释异常、派发给财务/采购/跟单继续处理。用户说“看物料对账”“通过这张对账单”“把这张对账退回”“这张对账为什么异常”“通知财务处理这张对账”时必须调用。");
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
            case "list_material_reconciliation" -> listReconciliations(args);
            case "update_status" -> updateStatus(args);
            case "return_previous" -> returnPrevious(args);
            case "explain_exception" -> explainException(args);
            case "dispatch_followup" -> dispatchFollowup(args);
            default -> "{\"error\":\"不支持的 action\"}";
        };
    }

    @Override
    public String getName() {
        return "tool_material_reconciliation";
    }

    private String listReconciliations(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        String keyword = text(args.get("keyword"));
        String orderNo = text(args.get("orderNo"));
        String sourceType = text(args.get("sourceType"));
        int limit = intOf(args.get("limit"), 10);
        List<MaterialReconciliation> items = materialReconciliationService.list(new LambdaQueryWrapper<MaterialReconciliation>()
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialReconciliation::getTenantId, tenantId)
                .eq(StringUtils.hasText(sourceType), MaterialReconciliation::getSourceType, sourceType)
                .like(StringUtils.hasText(orderNo), MaterialReconciliation::getOrderNo, orderNo)
                .and(StringUtils.hasText(keyword), q -> q.like(MaterialReconciliation::getReconciliationNo, keyword)
                        .or().like(MaterialReconciliation::getSupplierName, keyword)
                        .or().like(MaterialReconciliation::getMaterialName, keyword))
                .orderByAsc(MaterialReconciliation::getStatus)
                .orderByDesc(MaterialReconciliation::getCreateTime)
                .last("LIMIT " + limit));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "物料对账共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String updateStatus(Map<String, Object> args) throws Exception {
        String reconciliationId = required(args, "reconciliationId");
        String status = required(args, "status");
        String message = reconciliationStatusOrchestrator.updateMaterialStatus(reconciliationId, status);
        MaterialReconciliation current = materialReconciliationService.getById(reconciliationId);
        return ok(message, Map.of("reconciliationId", reconciliationId, "status", status, "item", current == null ? Map.of() : toDto(current)));
    }

    private String returnPrevious(Map<String, Object> args) throws Exception {
        String reconciliationId = required(args, "reconciliationId");
        String reason = required(args, "reason");
        String message = reconciliationStatusOrchestrator.returnMaterialToPrevious(reconciliationId, reason);
        MaterialReconciliation current = materialReconciliationService.getById(reconciliationId);
        return ok(message, Map.of("reconciliationId", reconciliationId, "reason", reason, "item", current == null ? Map.of() : toDto(current)));
    }

    private String explainException(Map<String, Object> args) throws Exception {
        MaterialReconciliation item = findRequired(args);
        List<String> reasons = new java.util.ArrayList<>();
        if (item.getDeductionAmount() != null && item.getDeductionAmount().compareTo(BigDecimal.ZERO) > 0) {
            reasons.add("存在扣减金额 " + item.getDeductionAmount() + "，说明有价格差异或数量扣减");
        }
        BigDecimal payable = item.getFinalAmount() != null ? item.getFinalAmount() : item.getTotalAmount();
        if (item.getPaidAmount() != null && payable != null && item.getPaidAmount().compareTo(payable) < 0) {
            reasons.add("已付金额 " + item.getPaidAmount() + " 低于应付金额 " + payable + "，仍有尾款未处理");
        }
        if (item.getExpectedArrivalDate() != null && item.getActualArrivalDate() != null
                && item.getActualArrivalDate().isAfter(item.getExpectedArrivalDate())) {
            long delayedDays = ChronoUnit.DAYS.between(item.getExpectedArrivalDate(), item.getActualArrivalDate());
            reasons.add("实际到货晚于预计到货 " + delayedDays + " 天，容易引发补扣或二次复核");
        }
        if ("rejected".equalsIgnoreCase(item.getStatus()) && StringUtils.hasText(item.getReReviewReason())) {
            reasons.add("该对账单曾被退回，原因是：" + item.getReReviewReason());
        }
        if (!StringUtils.hasText(item.getAuditOperatorName()) && "verified".equalsIgnoreCase(item.getStatus())) {
            reasons.add("已经核实但还没有明确审批责任人，建议尽快进入批准流程");
        }
        if (reasons.isEmpty()) {
            reasons.add("当前未发现明显异常字段，建议重点复核数量、单价、扣减项和付款状态");
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "已解释该物料对账单的异常来源");
        result.put("reconciliationId", item.getId());
        result.put("reasons", reasons);
        result.put("item", toDto(item));
        return MAPPER.writeValueAsString(result);
    }

    private String dispatchFollowup(Map<String, Object> args) throws Exception {
        MaterialReconciliation item = findRequired(args);
        String targetRole = StringUtils.hasText(text(args.get("targetRole"))) ? text(args.get("targetRole")) : defaultRole(item);
        String instruction = StringUtils.hasText(text(args.get("instruction")))
                ? text(args.get("instruction"))
                : "请跟进物料对账单 " + item.getReconciliationNo() + "，处理状态 " + item.getStatus() + "，并回写结果";
        CollaborationDispatchRequest request = new CollaborationDispatchRequest();
        request.setInstruction(instruction);
        request.setOrderNo(item.getOrderNo());
        request.setTargetRole(targetRole);
        request.setTitle("小云派单 — 物料对账跟进");
        request.setContent(buildDispatchContent(item, instruction, targetRole));
        request.setDueHint("今日内处理");
        CollaborationDispatchResponse dispatch = collaborationDispatchOrchestrator.dispatch(request);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", dispatch.isSuccess());
        result.put("summary", dispatch.getSummary());
        result.put("dispatch", dispatch);
        result.put("item", toDto(item));
        return MAPPER.writeValueAsString(result);
    }

    private MaterialReconciliation findRequired(Map<String, Object> args) {
        String reconciliationId = required(args, "reconciliationId");
        MaterialReconciliation item = materialReconciliationService.getById(reconciliationId);
        if (item == null || (item.getDeleteFlag() != null && item.getDeleteFlag() != 0)) {
            throw new IllegalArgumentException("物料对账单不存在");
        }
        return item;
    }

    private Map<String, Object> toDto(MaterialReconciliation item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId());
        dto.put("reconciliationNo", item.getReconciliationNo());
        dto.put("supplierName", item.getSupplierName());
        dto.put("materialName", item.getMaterialName());
        dto.put("orderNo", item.getOrderNo());
        dto.put("styleNo", item.getStyleNo());
        dto.put("sourceType", item.getSourceType());
        dto.put("status", item.getStatus());
        dto.put("quantity", item.getQuantity());
        dto.put("unitPrice", item.getUnitPrice());
        dto.put("totalAmount", item.getTotalAmount());
        dto.put("deductionAmount", item.getDeductionAmount());
        dto.put("finalAmount", item.getFinalAmount());
        dto.put("paidAmount", item.getPaidAmount());
        dto.put("auditOperatorName", item.getAuditOperatorName());
        dto.put("reReviewReason", item.getReReviewReason());
        return dto;
    }

    private String buildDispatchContent(MaterialReconciliation item, String instruction, String targetRole) {
        return "请处理物料对账单 " + item.getReconciliationNo()
                + "，供应商：" + safe(item.getSupplierName())
                + "，物料：" + safe(item.getMaterialName())
                + "，当前状态：" + safe(item.getStatus())
                + "。责任岗位：" + targetRole + "。要求：" + instruction;
    }

    private String defaultRole(MaterialReconciliation item) {
        if ("pending".equalsIgnoreCase(item.getStatus()) || "verified".equalsIgnoreCase(item.getStatus())) {
            return "财务";
        }
        return "采购";
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

    private String required(Map<String, Object> args, String key) {
        String value = text(args.get(key));
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("缺少参数: " + key);
        }
        return value;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }
}
