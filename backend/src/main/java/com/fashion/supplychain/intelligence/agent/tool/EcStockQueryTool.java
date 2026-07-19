package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.intelligence.agent.tool.AgentToolDef;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@Lazy
@AgentToolDef(name = "ec_stock_query", description = "查询电商跨平台库存、预警和采购建议")
@McpToolAnnotation(
        name = "ec_stock_query",
        description = "查询电商跨平台库存、预警和采购建议：总览库存分布、低库存SKU、未解决预警、待处理采购建议。当用户询问电商库存数量、低库存、库存预警时使用。",
        domain = ToolDomain.WAREHOUSE,
        readOnly = true,
        timeoutSeconds = 15,
        requiresConfirmation = false,
        tags = {"电商库存", "库存查询", "低库存", "库存预警", "采购建议"}
)
public class EcStockQueryTool {

    @Autowired private EcUniversalStockService universalStockService;
    @Autowired private EcStockAlertService stockAlertService;
    @Autowired private EcPurchaseSuggestionService purchaseSuggestionService;

    public Map<String, Object> execute(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        String action = (String) params.getOrDefault("action", "overview");

        return switch (action) {
            case "overview" -> getOverview(tenantId);
            case "low_stock" -> getLowStock(tenantId);
            case "alerts" -> getAlerts(tenantId);
            case "suggestions" -> getSuggestions(tenantId);
            default -> getOverview(tenantId);
        };
    }

    private Map<String, Object> getOverview(Long tenantId) {
        List<EcUniversalStock> all = universalStockService.listByTenant(tenantId);
        List<EcUniversalStock> low = universalStockService.listLowStock(tenantId);
        List<EcStockAlert> alerts = stockAlertService.listUnresolved(tenantId);
        List<EcPurchaseSuggestion> suggestions = purchaseSuggestionService.listPending(tenantId);

        Map<String, Object> result = new HashMap<>();
        result.put("totalSkus", all.size());
        result.put("lowStockCount", low.size());
        result.put("unresolvedAlerts", alerts.size());
        result.put("pendingSuggestions", suggestions.size());
        result.put("lowStockItems", low.stream().map(s -> Map.of(
                "skuId", s.getSkuId(),
                "available", s.getAvailableStock(),
                "safeStock", s.getSafeStock(),
                "warehouse", s.getWarehouse() != null ? s.getWarehouse() : "汇总"
        )).collect(Collectors.toList()));
        return result;
    }

    private Map<String, Object> getLowStock(Long tenantId) {
        List<EcUniversalStock> low = universalStockService.listLowStock(tenantId);
        return Map.of("count", low.size(), "items", low.stream().map(s -> Map.of(
                "skuId", s.getSkuId(),
                "available", s.getAvailableStock(),
                "safeStock", s.getSafeStock()
        )).collect(Collectors.toList()));
    }

    private Map<String, Object> getAlerts(Long tenantId) {
        List<EcStockAlert> alerts = stockAlertService.listUnresolved(tenantId);
        return Map.of("count", alerts.size(), "alerts", alerts.stream().map(a -> Map.of(
                "id", a.getId(),
                "type", a.getAlertType(),
                "skuCode", a.getSkuCode() != null ? a.getSkuCode() : "",
                "currentStock", a.getCurrentStock(),
                "safeStock", a.getSafeStock(),
                "message", a.getMessage() != null ? a.getMessage() : ""
        )).collect(Collectors.toList()));
    }

    private Map<String, Object> getSuggestions(Long tenantId) {
        List<EcPurchaseSuggestion> suggestions = purchaseSuggestionService.listPending(tenantId);
        return Map.of("count", suggestions.size(), "suggestions", suggestions.stream().map(s -> Map.of(
                "id", s.getId(),
                "skuCode", s.getSkuCode() != null ? s.getSkuCode() : "",
                "suggestQty", s.getSuggestQuantity(),
                "urgency", s.getUrgencyLevel(),
                "reason", s.getReason() != null ? s.getReason() : ""
        )).collect(Collectors.toList()));
    }
}
