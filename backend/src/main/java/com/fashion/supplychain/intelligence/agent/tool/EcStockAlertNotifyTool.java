package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.entity.EcStockAlert;
import com.fashion.supplychain.integration.ecommerce.entity.EcPurchaseSuggestion;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcStockOrchestrator;
import com.fashion.supplychain.integration.ecommerce.service.EcStockAlertService;
import com.fashion.supplychain.integration.ecommerce.service.EcPurchaseSuggestionService;
import com.fashion.supplychain.intelligence.agent.tool.AgentToolDef;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@AgentToolDef(name = "ec_stock_alert", description = "电商库存预警检测与采购建议生成")
public class EcStockAlertNotifyTool {

    @Autowired private EcStockOrchestrator stockOrchestrator;
    @Autowired private EcStockAlertService stockAlertService;
    @Autowired private EcPurchaseSuggestionService purchaseSuggestionService;

    public Map<String, Object> execute(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        String action = (String) params.getOrDefault("action", "check");

        return switch (action) {
            case "check" -> checkAlerts(tenantId);
            case "generate_suggestions" -> generateSuggestions(tenantId);
            case "sync" -> syncAndCheck(tenantId);
            default -> checkAlerts(tenantId);
        };
    }

    private Map<String, Object> checkAlerts(Long tenantId) {
        List<EcStockAlert> alerts = stockAlertService.listUnresolved(tenantId);
        Map<String, Object> result = new HashMap<>();
        result.put("alertCount", alerts.size());
        result.put("hasUrgent", alerts.stream().anyMatch(a -> "OUT_OF_STOCK".equals(a.getAlertType())));
        result.put("alerts", alerts.stream().map(a -> Map.of(
                "id", a.getId(),
                "type", a.getAlertType(),
                "message", a.getMessage() != null ? a.getMessage() : "",
                "currentStock", a.getCurrentStock()
        )).toList());
        return result;
    }

    private Map<String, Object> generateSuggestions(Long tenantId) {
        stockOrchestrator.generatePurchaseSuggestions(tenantId);
        List<EcPurchaseSuggestion> suggestions = purchaseSuggestionService.listPending(tenantId);
        return Map.of("generated", suggestions.size(), "suggestions", suggestions.stream().map(s -> Map.of(
                "id", s.getId(),
                "skuCode", s.getSkuCode() != null ? s.getSkuCode() : "",
                "suggestQty", s.getSuggestQuantity(),
                "urgency", s.getUrgencyLevel()
        )).toList());
    }

    private Map<String, Object> syncAndCheck(Long tenantId) {
        stockOrchestrator.syncAllStock(tenantId);
        return checkAlerts(tenantId);
    }
}
