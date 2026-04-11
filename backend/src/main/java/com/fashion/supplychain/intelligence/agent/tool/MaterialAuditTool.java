package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.procurement.orchestration.ProcurementOrchestrator;
import com.fashion.supplychain.warehouse.entity.MaterialPickupRecord;
import com.fashion.supplychain.warehouse.mapper.MaterialPickupRecordMapper;
import com.fashion.supplychain.warehouse.orchestration.MaterialPickupOrchestrator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class MaterialAuditTool implements AgentTool {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    @Autowired private MaterialPurchaseService materialPurchaseService;
    @Autowired private ProcurementOrchestrator procurementOrchestrator;
    @Autowired private MaterialPickupRecordMapper materialPickupRecordMapper;
    @Autowired private MaterialPickupOrchestrator materialPickupOrchestrator;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "动作: list_material_audits | initiate_purchase_audit | approve_purchase_audit | reject_purchase_audit | approve_pickup_audit | reject_pickup_audit"));
        properties.put("purchaseId", schema("string", "采购单ID，采购审核动作时使用"));
        properties.put("pickupId", schema("string", "领取单ID，领取审核动作时使用"));
        properties.put("reason", schema("string", "驳回原因，reject 动作必填"));
        properties.put("orderNo", schema("string", "可选，按订单号过滤"));
        properties.put("keyword", schema("string", "可选，按采购单号/物料名/供应商/领取单号模糊过滤"));
        properties.put("limit", schema("integer", "可选，列表条数，默认 10"));
        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("处理面辅料相关审核与审批。支持查看待发起初审的采购单、待初审采购单、待审核领取单，并支持直接发起采购初审、通过/驳回采购初审、通过/驳回领取审核。当用户说“帮我看看面辅料待审核”“通过这张采购单初审”“驳回这张领取单”时必须调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (UserContext.tenantId() == null) {
            return "{\"success\":false,\"error\":\"租户上下文丢失，请重新登录\"}";
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson == null || argumentsJson.isBlank() ? "{}" : argumentsJson, new TypeReference<Map<String, Object>>() {});
        String action = stringOf(args.get("action"));
        return switch (action) {
            case "list_material_audits" -> listMaterialAudits(args);
            case "initiate_purchase_audit" -> initiatePurchaseAudit(args);
            case "approve_purchase_audit" -> approvePurchaseAudit(args);
            case "reject_purchase_audit" -> rejectPurchaseAudit(args);
            case "approve_pickup_audit" -> approvePickupAudit(args);
            case "reject_pickup_audit" -> rejectPickupAudit(args);
            default -> "{\"error\":\"不支持的 action: " + safe(action) + "\"}";
        };
    }

    @Override
    public String getName() {
        return "tool_material_audit";
    }

    private String listMaterialAudits(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        int limit = intOf(args.get("limit"), 10);
        String orderNo = stringOf(args.get("orderNo"));
        String keyword = stringOf(args.get("keyword"));
        List<MaterialPurchase> purchaseCandidates = materialPurchaseService.list(purchaseQuery(tenantId, orderNo, keyword, limit).eq(MaterialPurchase::getStatus, "completed").isNull(MaterialPurchase::getAuditStatus));
        List<MaterialPurchase> purchasePending = materialPurchaseService.list(purchaseQuery(tenantId, orderNo, keyword, limit).eq(MaterialPurchase::getAuditStatus, "pending_audit"));
        List<MaterialPickupRecord> pickupPending = materialPickupRecordMapper.selectList(new LambdaQueryWrapper<MaterialPickupRecord>()
                .eq(MaterialPickupRecord::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialPickupRecord::getTenantId, tenantId != null ? String.valueOf(tenantId) : null)
                .eq(MaterialPickupRecord::getAuditStatus, "PENDING")
                .like(StringUtils.hasText(orderNo), MaterialPickupRecord::getOrderNo, orderNo)
                .and(StringUtils.hasText(keyword), q -> q.like(MaterialPickupRecord::getPickupNo, keyword).or().like(MaterialPickupRecord::getMaterialName, keyword).or().like(MaterialPickupRecord::getPickerName, keyword))
                .orderByDesc(MaterialPickupRecord::getCreateTime).last("LIMIT " + limit));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("purchaseAuditCandidates", purchaseCandidates.stream().map(this::toPurchaseDto).toList());
        result.put("purchasePendingAudits", purchasePending.stream().map(this::toPurchaseDto).toList());
        result.put("pickupPendingAudits", pickupPending.stream().map(this::toPickupDto).toList());
        result.put("summary", "面辅料审核池：待发起采购初审 " + purchaseCandidates.size() + " 条，待采购初审 " + purchasePending.size() + " 条，待领取审核 " + pickupPending.size() + " 条");
        return MAPPER.writeValueAsString(result);
    }

    private String initiatePurchaseAudit(Map<String, Object> args) throws Exception {
        String purchaseId = required(args, "purchaseId");
        procurementOrchestrator.initiateAudit(purchaseId);
        return ok("已发起该面辅料采购单初审", Map.of("purchaseId", purchaseId, "action", "initiate_purchase_audit"));
    }

    private String approvePurchaseAudit(Map<String, Object> args) throws Exception {
        String purchaseId = required(args, "purchaseId");
        procurementOrchestrator.passAudit(purchaseId);
        return ok("已通过该面辅料采购单初审，并同步进入物料对账流程", Map.of("purchaseId", purchaseId, "action", "approve_purchase_audit"));
    }

    private String rejectPurchaseAudit(Map<String, Object> args) throws Exception {
        String purchaseId = required(args, "purchaseId");
        String reason = required(args, "reason");
        procurementOrchestrator.rejectAudit(purchaseId, reason);
        return ok("已驳回该面辅料采购单初审", Map.of("purchaseId", purchaseId, "reason", reason, "action", "reject_purchase_audit"));
    }

    private String approvePickupAudit(Map<String, Object> args) throws Exception {
        String pickupId = required(args, "pickupId");
        materialPickupOrchestrator.audit(pickupId, Map.of("action", "approve"));
        return ok("已通过该面辅料领取单审核", Map.of("pickupId", pickupId, "action", "approve_pickup_audit"));
    }

    private String rejectPickupAudit(Map<String, Object> args) throws Exception {
        String pickupId = required(args, "pickupId");
        String reason = required(args, "reason");
        materialPickupOrchestrator.audit(pickupId, Map.of("action", "reject", "remark", reason));
        return ok("已驳回该面辅料领取单审核", Map.of("pickupId", pickupId, "reason", reason, "action", "reject_pickup_audit"));
    }

    private Map<String, Object> toPurchaseDto(MaterialPurchase item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId()); dto.put("purchaseNo", item.getPurchaseNo()); dto.put("orderNo", item.getOrderNo());
        dto.put("materialName", item.getMaterialName()); dto.put("supplierName", item.getSupplierName()); dto.put("status", item.getStatus());
        dto.put("auditStatus", item.getAuditStatus()); dto.put("arrivedQuantity", item.getArrivedQuantity()); dto.put("purchaseQuantity", item.getPurchaseQuantity()); dto.put("totalAmount", item.getTotalAmount());
        return dto;
    }

    private Map<String, Object> toPickupDto(MaterialPickupRecord item) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", item.getId()); dto.put("pickupNo", item.getPickupNo()); dto.put("orderNo", item.getOrderNo()); dto.put("materialName", item.getMaterialName());
        dto.put("pickerName", item.getPickerName()); dto.put("quantity", item.getQuantity()); dto.put("auditStatus", item.getAuditStatus()); dto.put("financeStatus", item.getFinanceStatus());
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
        field.put("type", type); field.put("description", description);
        return field;
    }

    private LambdaQueryWrapper<MaterialPurchase> purchaseQuery(Long tenantId, String orderNo, String keyword, int limit) {
        return new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(tenantId != null, MaterialPurchase::getTenantId, tenantId)
                .like(StringUtils.hasText(orderNo), MaterialPurchase::getOrderNo, orderNo)
                .and(StringUtils.hasText(keyword), q -> q.like(MaterialPurchase::getPurchaseNo, keyword).or().like(MaterialPurchase::getMaterialName, keyword).or().like(MaterialPurchase::getSupplierName, keyword))
                .orderByDesc(MaterialPurchase::getUpdateTime).last("LIMIT " + limit);
    }

    private String required(Map<String, Object> args, String key) {
        String value = stringOf(args.get(key));
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("缺少参数: " + key);
        }
        return value;
    }

    private String stringOf(Object value) {
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
    private String safe(String value) { return value == null ? "" : value; }
}
