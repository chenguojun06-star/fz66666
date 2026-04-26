package com.fashion.supplychain.template.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class TemplatePriceSyncHelper {

    @Autowired private ProductionOrderService productionOrderService;
    @Autowired private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;
    @Autowired private TemplateLibraryService templateLibraryService;
    @Autowired private ObjectMapper objectMapper;

    /**
     * 批量同步工序进度单价（反推生产订单）
     *
     * @param styleNo 款号
     * @return 同步结果摘要
     */
    public Map<String, Object> syncProcessUnitPricesByStyleNo(String styleNo) {
        return syncProcessUnitPricesByStyleNo(styleNo, null);
    }

    public Map<String, Object> syncProcessUnitPricesByStyleNo(String styleNo, List<String> orderIds) {
        String sn = StringUtils.hasText(styleNo) ? styleNo.trim() : "";
        if (!StringUtils.hasText(sn)) {
            throw new IllegalArgumentException("款号不能为空");
        }
        String currentFactoryId = UserContext.factoryId();
        LambdaQueryWrapper<ProductionOrder> orderQuery = new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .eq(ProductionOrder::getStyleNo, sn)
                .isNotNull(ProductionOrder::getStyleNo);
        // 外发工厂账号：只同步本工厂的订单，防止跨厂污染
        if (StringUtils.hasText(currentFactoryId)) {
            orderQuery.eq(ProductionOrder::getFactoryId, currentFactoryId);
        }
        // 用户选定的订单 ID 列表：只同步选中的部分
        if (orderIds != null && !orderIds.isEmpty()) {
            orderQuery.in(ProductionOrder::getId, orderIds);
        }
        List<ProductionOrder> orders = productionOrderService.list(orderQuery);
        int totalOrders = orders.size();
        int successCount = 0;
        int totalSynced = 0;
        int workflowUpdatedOrders = 0;
        int workflowUpdatedNodes = 0;
        List<Map<String, Object>> details = new ArrayList<>();
        for (ProductionOrder order : orders) {
            int synced = 0;
            int workflowUpdated = 0;
            boolean touched = false;
            try {
                synced = processTrackingOrchestrator.syncUnitPrices(order.getId());
                if (synced > 0) {
                    totalSynced += synced;
                    touched = true;
                }
            } catch (Exception e) {
                log.warn("订单 {} 单价同步失败: {}", order.getOrderNo(), e.getMessage());
            }

            try {
                workflowUpdated = refreshOrderWorkflowPrices(order);
                if (workflowUpdated > 0) {
                    workflowUpdatedOrders++;
                    workflowUpdatedNodes += workflowUpdated;
                    touched = true;
                }
            } catch (Exception e) {
                log.warn("订单 {} 工序单价快照刷新失败: {}", order.getOrderNo(), e.getMessage());
            }

            if (touched) {
                successCount++;
            }
            Map<String, Object> d = new HashMap<>();
            d.put("orderNo", order.getOrderNo());
            d.put("styleNo", order.getStyleNo());
            d.put("syncedRecords", synced);
            d.put("workflowUpdatedNodes", workflowUpdated);
            details.add(d);
        }
        Map<String, Object> result = new HashMap<>();
        result.put("styleNo", sn);
        result.put("scopeLabel", "款号 " + sn);
        result.put("totalOrders", totalOrders);
        result.put("successOrders", successCount);
        result.put("totalSynced", totalSynced);
        result.put("workflowUpdatedOrders", workflowUpdatedOrders);
        result.put("workflowUpdatedNodes", workflowUpdatedNodes);
        result.put("details", details);
        return result;
    }

    private int refreshOrderWorkflowPrices(ProductionOrder order) throws Exception {
        if (order == null || !StringUtils.hasText(order.getStyleNo()) || !StringUtils.hasText(order.getProgressWorkflowJson())) {
            return 0;
        }

        List<Map<String, Object>> templateNodes = templateLibraryService.resolveProgressNodeUnitPrices(order.getStyleNo().trim());
        if (templateNodes == null || templateNodes.isEmpty()) {
            return 0;
        }

        Map<String, BigDecimal> priceMap = new HashMap<>();
        Map<String, String> codeMap = new HashMap<>();
        for (Map<String, Object> templateNode : templateNodes) {
            String name = String.valueOf(templateNode.getOrDefault("name", "")).trim();
            if (!StringUtils.hasText(name)) {
                continue;
            }
            BigDecimal price = TemplateParseUtils.toBigDecimal(templateNode.get("unitPrice"));
            priceMap.put(name, price == null ? BigDecimal.ZERO : price);
            String id = String.valueOf(templateNode.getOrDefault("id", "")).trim();
            if (StringUtils.hasText(id)) {
                codeMap.put(name, id);
            }
        }
        if (priceMap.isEmpty() && codeMap.isEmpty()) {
            return 0;
        }

        Map<String, Object> workflow = objectMapper.readValue(order.getProgressWorkflowJson(), new TypeReference<Map<String, Object>>() {});
        List<Map<String, Object>> nodes = TemplateParseUtils.coerceListOfMap(workflow.get("nodes"));
        if (nodes.isEmpty()) {
            return 0;
        }

        int changedCount = 0;
        for (Map<String, Object> node : nodes) {
            String nodeName = String.valueOf(node.getOrDefault("name", "")).trim();
            if (!StringUtils.hasText(nodeName)) {
                continue;
            }
            if (priceMap.containsKey(nodeName)) {
                BigDecimal nextPrice = priceMap.get(nodeName);
                BigDecimal currentPrice = TemplateParseUtils.toBigDecimal(node.get("unitPrice"));
                if (currentPrice == null || currentPrice.compareTo(nextPrice) != 0) {
                    node.put("unitPrice", nextPrice);
                    changedCount++;
                }
            }
            String templateCode = codeMap.get(nodeName);
            if (StringUtils.hasText(templateCode)) {
                Object currentId = node.get("id");
                String currentIdStr = currentId == null ? "" : String.valueOf(currentId).trim();
                if (!templateCode.equals(currentIdStr)) {
                    node.put("id", templateCode);
                    changedCount++;
                }
            }
        }
        if (changedCount <= 0) {
            return 0;
        }

        workflow.put("nodes", nodes);
        productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, order.getId())
                .set(ProductionOrder::getProgressWorkflowJson, objectMapper.writeValueAsString(workflow))
                .update();
        return changedCount;
    }

}
