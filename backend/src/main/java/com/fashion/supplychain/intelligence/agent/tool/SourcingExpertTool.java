package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.SupplierScorecardResponse;
import com.fashion.supplychain.intelligence.orchestration.SupplierScorecardOrchestrator;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@AgentToolDef(name = "tool_sourcing_expert", description = "采购供应商专家工具", domain = ToolDomain.WAREHOUSE, timeoutMs = 15000)
@McpToolAnnotation(
        name = "tool_sourcing_expert",
        description = "采购供应商专家工具",
        domain = ToolDomain.WAREHOUSE,
        readOnly = true,
        timeoutSeconds = 15,
        requiresConfirmation = false,
        tags = {"供应商查询", "采购", "供应商评分", "采购状态", "物料采购"}
)
public class SourcingExpertTool extends AbstractAgentTool {

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private SupplierScorecardOrchestrator supplierScorecardOrchestrator;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Override
    public String getName() {
        return "tool_sourcing_expert";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.WAREHOUSE;
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: supplier_query | supplier_scorecard | procurement_status"));
        properties.put("supplierName", stringProp("供应商名称（supplier_query模糊匹配/supplier_scorecard精确匹配时可选）"));
        properties.put("orderNo", stringProp("采购单关联订单号（procurement_status时可选）"));
        properties.put("status", stringProp("采购单状态过滤（procurement_status时可选）"));
        properties.put("limit", intProp("返回条数，默认10"));
        return buildToolDef(
                "采购供应商专家工具：查询供应商信息、供应商评分卡、采购单状态。所有数据来自真实数据库查询，绝不编造。",
                properties, List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");
        return switch (action) {
            case "supplier_query" -> supplierQuery(args);
            case "supplier_scorecard" -> supplierScorecard(args);
            case "procurement_status" -> procurementStatus(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String supplierQuery(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        String supplierName = optionalString(args, "supplierName");
        String materialType = optionalString(args, "materialType");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<Factory> query = new LambdaQueryWrapper<Factory>()
                .eq(Factory::getTenantId, tenantId)
                .eq(Factory::getDeleteFlag, 0)
                .eq(Factory::getStatus, "active")
                .and(StringUtils.hasText(supplierName), q -> q
                        .like(Factory::getFactoryName, supplierName)
                        .or().like(Factory::getContactPerson, supplierName))
                .orderByDesc(Factory::getOverallScore)
                .last("LIMIT " + limit);

        List<Factory> items = factoryService.list(query);
        if (items.isEmpty()) {
            return successJson("系统中暂无匹配的供应商数据", Map.of("items", List.of(), "total", 0));
        }

        List<Map<String, Object>> dtoList = items.stream().map(f -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("id", f.getId());
            dto.put("name", f.getFactoryName());
            dto.put("type", f.getFactoryType());
            dto.put("supplierType", f.getSupplierType());
            dto.put("contactPerson", f.getContactPerson());
            dto.put("contactPhone", f.getContactPhone());
            dto.put("region", f.getSupplierRegion());
            dto.put("tier", f.getSupplierTier());
            dto.put("overallScore", f.getOverallScore());
            dto.put("onTimeDeliveryRate", f.getOnTimeDeliveryRate());
            dto.put("qualityScore", f.getQualityScore());
            return dto;
        }).toList();

        return successJson("供应商查询结果", Map.of("items", dtoList, "total", dtoList.size()));
    }

    private String supplierScorecard(Map<String, Object> args) {
        try {
            String supplierName = optionalString(args, "supplierName");
            SupplierScorecardResponse resp = supplierScorecardOrchestrator.scorecard();

            if (StringUtils.hasText(supplierName)) {
                var matched = resp.getScores().stream()
                        .filter(s -> supplierName.equals(s.getFactoryName()))
                        .findFirst();
                if (matched.isEmpty()) {
                    return successJson("系统中暂无该供应商的评分数据", Map.of("scorecard", Map.of()));
                }
                return successJson("供应商评分卡", Map.of("scorecard", toScorecardMap(matched.get())));
            }

            List<Map<String, Object>> rows = resp.getScores().stream()
                    .limit(10)
                    .map(this::toScorecardMap)
                    .toList();
            return successJson(resp.getSummary(), Map.of("scorecards", rows));
        } catch (Exception e) {
            log.error("[SourcingExpertTool.supplier_scorecard] 异常: {}", e.getMessage(), e);
            return errorJson("供应商评分卡查询失败: " + e.getMessage());
        }
    }

    private String procurementStatus(Map<String, Object> args) throws Exception {
        Long tenantId = UserContext.tenantId();
        String orderNo = optionalString(args, "orderNo");
        String status = optionalString(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<MaterialPurchase> query = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(StringUtils.hasText(orderNo), MaterialPurchase::getOrderNo, orderNo)
                .eq(StringUtils.hasText(status), MaterialPurchase::getStatus, status)
                .orderByDesc(MaterialPurchase::getCreateTime)
                .last("LIMIT " + limit);

        List<MaterialPurchase> items = materialPurchaseService.list(query);
        if (items.isEmpty()) {
            return successJson("系统中暂无匹配的采购单数据", Map.of("items", List.of(), "total", 0));
        }

        List<Map<String, Object>> dtoList = items.stream().map(p -> {
            Map<String, Object> dto = new LinkedHashMap<>();
            dto.put("purchaseNo", p.getPurchaseNo());
            dto.put("materialName", p.getMaterialName());
            dto.put("materialType", p.getMaterialType());
            dto.put("supplierName", p.getSupplierName());
            dto.put("purchaseQuantity", p.getPurchaseQuantity());
            dto.put("arrivedQuantity", p.getArrivedQuantity());
            dto.put("status", p.getStatus());
            dto.put("orderNo", p.getOrderNo());
            dto.put("expectedArrivalDate", p.getExpectedArrivalDate());
            dto.put("actualArrivalDate", p.getActualArrivalDate());
            return dto;
        }).toList();

        return successJson("采购单查询结果", Map.of("items", dtoList, "total", dtoList.size()));
    }

    private Map<String, Object> toScorecardMap(SupplierScorecardResponse.SupplierScore s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("factoryName", s.getFactoryName());
        m.put("tier", s.getTier());
        m.put("overallScore", s.getOverallScore());
        m.put("onTimeRate", s.getOnTimeRate());
        m.put("qualityScore", s.getQualityScore());
        m.put("totalOrders", s.getTotalOrders());
        m.put("completedOrders", s.getCompletedOrders());
        m.put("overdueOrders", s.getOverdueOrders());
        return m;
    }
}
