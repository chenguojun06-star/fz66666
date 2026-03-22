package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import com.fashion.supplychain.warehouse.orchestration.FinishedInventoryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;

/**
 * AI小云工具：成品大货出库
 * <p>
 * 安全：外发工厂账号不可操作；必须有角色；操作写审计日志
 * 委托 FinishedInventoryOrchestrator.outbound() 执行，含事务回滚保障
 */
@Slf4j
@Component
public class FinishedOutboundTool implements AgentTool {

    private static final ObjectMapper mapper = new ObjectMapper();

    @Autowired
    private FinishedInventoryOrchestrator finishedInventoryOrchestrator;

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    @Override
    public String getName() {
        return "tool_finished_outbound";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> items = new LinkedHashMap<>();
        items.put("type", "string");
        items.put("description", "出库明细JSON数组字符串，每项包含 sku（SKU编码）和 quantity（数量），例：[{\"sku\":\"FZ2024001-红色-XL\",\"quantity\":50}]");
        properties.put("items", items);

        Map<String, Object> orderNo = new LinkedHashMap<>();
        orderNo.put("type", "string");
        orderNo.put("description", "关联订单号（可选）");
        properties.put("orderNo", orderNo);

        Map<String, Object> warehouseLocation = new LinkedHashMap<>();
        warehouseLocation.put("type", "string");
        warehouseLocation.put("description", "仓库/存放位置（可选）");
        properties.put("warehouseLocation", warehouseLocation);

        Map<String, Object> productionOrderNo = new LinkedHashMap<>();
        productionOrderNo.put("type", "string");
        productionOrderNo.put("description", "关联生产订单号（可选，有值时同步更新电商订单状态）");
        properties.put("productionOrderNo", productionOrderNo);

        Map<String, Object> trackingNo = new LinkedHashMap<>();
        trackingNo.put("type", "string");
        trackingNo.put("description", "快递单号（可选）");
        properties.put("trackingNo", trackingNo);

        Map<String, Object> expressCompany = new LinkedHashMap<>();
        expressCompany.put("type", "string");
        expressCompany.put("description", "快递公司名称（可选）");
        properties.put("expressCompany", expressCompany);

        Map<String, Object> remark = new LinkedHashMap<>();
        remark.put("type", "string");
        remark.put("description", "操作备注");
        properties.put("remark", remark);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("成品大货出库操作。按SKU指定出库数量，支持同时关联订单号和快递信息。操作自动写入审计日志，可通过 tool_warehouse_op_log 查询历史。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("items"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        // 安全门禁1：外发工厂账号不允许操作
        if (UserContext.factoryId() != null) {
            return mapper.writeValueAsString(Map.of("error", "外发工厂账号无权执行出库操作，请联系内部管理人员"));
        }

        // 安全门禁2：必须有角色信息
        String role = UserContext.role();
        if (role == null || role.isBlank()) {
            return mapper.writeValueAsString(Map.of("error", "账号角色信息缺失，无权执行出库操作"));
        }

        Map<String, Object> args = mapper.readValue(argumentsJson, new TypeReference<>() {});
        String itemsJsonStr = (String) args.get("items");
        if (itemsJsonStr == null || itemsJsonStr.isBlank()) {
            return mapper.writeValueAsString(Map.of("error", "缺少参数：items（出库明细）"));
        }

        List<Map<String, Object>> itemList;
        try {
            itemList = mapper.readValue(itemsJsonStr, new TypeReference<>() {});
        } catch (Exception e) {
            return mapper.writeValueAsString(Map.of("error", "items 格式错误，需为JSON数组：" + e.getMessage()));
        }

        if (itemList == null || itemList.isEmpty()) {
            return mapper.writeValueAsString(Map.of("error", "出库明细不能为空"));
        }

        String operatorName = UserContext.username();
        Long tenantId = UserContext.tenantId();

        // 构建出库参数
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("items", itemList);
        putIfPresent(params, args, "orderNo");
        putIfPresent(params, args, "warehouseLocation");
        putIfPresent(params, args, "productionOrderNo");
        putIfPresent(params, args, "trackingNo");
        putIfPresent(params, args, "expressCompany");

        // 统计出库总件数用于审计日志
        int totalQty = itemList.stream()
                .mapToInt(item -> Integer.parseInt(item.getOrDefault("quantity", "0").toString()))
                .sum();
        String detail = "共" + itemList.size() + "个SKU，共" + totalQty + "件，orderNo="
                + args.getOrDefault("orderNo", "无");

        try {
            finishedInventoryOrchestrator.outbound(params);
        } catch (IllegalArgumentException e) {
            writeAuditLog(tenantId, operatorName, role, detail, "FAILED", e.getMessage());
            log.warn("[FinishedOutboundTool] 出库参数异常: {}", e.getMessage());
            return mapper.writeValueAsString(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            writeAuditLog(tenantId, operatorName, role, detail, "FAILED", e.getMessage());
            log.error("[FinishedOutboundTool] 出库失败: {}", e.getMessage());
            return mapper.writeValueAsString(Map.of("error", "出库操作失败：" + e.getMessage()));
        }

        writeAuditLog(tenantId, operatorName, role, detail, "SUCCESS", null);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("totalSkus", itemList.size());
        result.put("totalQuantity", totalQty);
        result.put("message", "大货出库成功，共出库 " + itemList.size() + " 个SKU，合计 " + totalQty + " 件");
        return mapper.writeValueAsString(result);
    }

    private void putIfPresent(Map<String, Object> target, Map<String, Object> src, String key) {
        Object val = src.get(key);
        if (val != null && !val.toString().isBlank()) {
            target.put(key, val.toString());
        }
    }

    private void writeAuditLog(Long tenantId, String operatorName, String role,
                               String detail, String status, String errorMsg) {
        try {
            IntelligenceAuditLog log = IntelligenceAuditLog.builder()
                    .tenantId(tenantId)
                    .executorId(UserContext.userId())
                    .action("finished_outbound")
                    .reason("[AI小云仓库操作] 操作人: " + operatorName + " 角色: " + role + " 参数: " + detail)
                    .status(status)
                    .errorMessage(errorMsg)
                    .createdAt(LocalDateTime.now())
                    .build();
            auditLogMapper.insert(log);
        } catch (Exception ex) {
            FinishedOutboundTool.log.warn("[FinishedOutboundTool] 审计日志写入失败: {}", ex.getMessage());
        }
    }
}
