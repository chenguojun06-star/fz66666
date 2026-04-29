package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import com.fashion.supplychain.intelligence.service.OrderDecisionSnapshotService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderDecisionCaptureOrchestrator {

    private final ProductionOrderService productionOrderService;
    private final OrderDecisionSnapshotService orderDecisionSnapshotService;
    private final ObjectMapper objectMapper;

    public void captureByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) {
            return;
        }
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            return;
        }
        capture(order);
    }

    public void capture(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getId())) {
            return;
        }
        try {
            JsonNode pricingNode = readPricingNode(order.getOrderDetails());
            Set<String> colors = new LinkedHashSet<>();
            Set<String> sizes = new LinkedHashSet<>();
            collectColorSize(order.getOrderDetails(), colors, sizes);

            OrderDecisionSnapshot snapshot = orderDecisionSnapshotService.getOne(
                    new LambdaQueryWrapper<OrderDecisionSnapshot>()
                            .eq(OrderDecisionSnapshot::getTenantId, UserContext.tenantId())
                            .eq(OrderDecisionSnapshot::getOrderId, order.getId())
                            .last("limit 1"),
                    false
            );
            if (snapshot == null) {
                snapshot = new OrderDecisionSnapshot();
                snapshot.setCreateTime(LocalDateTime.now());
            }
            snapshot.setTenantId(UserContext.tenantId());
            snapshot.setOrderId(order.getId());
            snapshot.setOrderNo(order.getOrderNo());
            snapshot.setStyleId(order.getStyleId());
            snapshot.setStyleNo(order.getStyleNo());
            snapshot.setStyleName(order.getStyleName());
            snapshot.setStyleCategory(order.getProductCategory());
            snapshot.setFactoryMode(normalizeFactoryMode(order.getFactoryType()));
            snapshot.setFactoryId(parseLong(order.getFactoryId()));
            snapshot.setFactoryName(order.getFactoryName());
            snapshot.setSelectedPricingMode(emptyToDefault(order.getPricingMode(), "PROCESS"));
            snapshot.setSelectedOrderUnitPrice(order.getFactoryUnitPrice());
            snapshot.setSelectedScatterPricingMode(emptyToDefault(order.getScatterPricingMode(), order.getPricingMode()));
            snapshot.setSelectedScatterUnitPrice(order.getScatterCuttingUnitPrice());
            snapshot.setProcessUnitPrice(decimalValue(pricingNode, "processBasedUnitPrice"));
            snapshot.setSizeUnitPrice(decimalValue(pricingNode, "sizeBasedUnitPrice"));
            snapshot.setTotalCostUnitPrice(decimalValue(pricingNode, "totalCostUnitPrice"));
            snapshot.setQuotationUnitPrice(decimalValue(pricingNode, "quotationUnitPrice"));
            snapshot.setAiRecommendedPricingMode(deriveRecommendedPricingMode(order, pricingNode));
            snapshot.setAiRecommendedFactoryMode(normalizeFactoryMode(order.getFactoryType()));
            snapshot.setAiRecommendedUnitPrice(deriveRecommendedUnitPrice(order, pricingNode));
            snapshot.setOrderQuantity(order.getOrderQuantity());
            snapshot.setColorCount(colors.size());
            snapshot.setSizeCount(sizes.size());
            snapshot.setScatterExtraPerPiece(computeScatterExtra(order));
            snapshot.setRecommendationReason(buildReason(order, pricingNode));
            snapshot.setPricingContextJson(pricingNode == null || pricingNode.isMissingNode() ? null : pricingNode.toString());
            snapshot.setCreatedBy(UserContext.username());
            snapshot.setUpdateTime(LocalDateTime.now());
            orderDecisionSnapshotService.saveOrUpdate(snapshot);
        } catch (Exception ex) {
            log.warn("capture order decision snapshot failed, orderId={}", order.getId(), ex);
        }
    }

    private JsonNode readPricingNode(String orderDetails) {
        try {
            JsonNode root = objectMapper.readTree(StringUtils.hasText(orderDetails) ? orderDetails : "{}");
            JsonNode pricing = root.path("pricing");
            return pricing.isMissingNode() ? null : pricing;
        } catch (Exception ex) {
            log.debug("[OrderDecision] readPricingNode失败", ex);
            return null;
        }
    }

    private void collectColorSize(String orderDetails, Set<String> colors, Set<String> sizes) {
        try {
            JsonNode root = objectMapper.readTree(StringUtils.hasText(orderDetails) ? orderDetails : "{}");
            JsonNode lines = root.path("lines");
            if (!lines.isArray()) {
                return;
            }
            Iterator<JsonNode> iterator = lines.elements();
            while (iterator.hasNext()) {
                JsonNode line = iterator.next();
                String color = line.path("color").asText("");
                String size = line.path("size").asText("");
                if (StringUtils.hasText(color)) {
                    colors.add(color.trim());
                }
                if (StringUtils.hasText(size)) {
                    sizes.add(size.trim());
                }
            }
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
    }

    private BigDecimal decimalValue(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode target = node.path(field);
        if (target.isMissingNode() || target.isNull()) {
            return null;
        }
        try {
            return new BigDecimal(target.asText("0"));
        } catch (Exception ex) {
            log.debug("[OrderDecision] decimalValue解析失败: field={}", field);
            return null;
        }
    }

    private String normalizeFactoryMode(String factoryType) {
        return "EXTERNAL".equalsIgnoreCase(String.valueOf(factoryType)) ? "EXTERNAL" : "INTERNAL";
    }

    private String emptyToDefault(String value, String defaultValue) {
        return StringUtils.hasText(value) ? value : defaultValue;
    }

    private Long parseLong(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BigDecimal computeScatterExtra(ProductionOrder order) {
        if (order.getScatterCuttingUnitPrice() == null || order.getFactoryUnitPrice() == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal diff = order.getScatterCuttingUnitPrice().subtract(order.getFactoryUnitPrice());
        return diff.compareTo(BigDecimal.ZERO) > 0 ? diff : BigDecimal.ZERO;
    }

    private String deriveRecommendedPricingMode(ProductionOrder order, JsonNode pricingNode) {
        BigDecimal totalCost = decimalValue(pricingNode, "totalCostUnitPrice");
        if ("EXTERNAL".equalsIgnoreCase(order.getFactoryType()) && totalCost != null && totalCost.compareTo(BigDecimal.ZERO) > 0) {
            return "COST";
        }
        return emptyToDefault(order.getPricingMode(), "PROCESS");
    }

    private BigDecimal deriveRecommendedUnitPrice(ProductionOrder order, JsonNode pricingNode) {
        String mode = deriveRecommendedPricingMode(order, pricingNode);
        if ("COST".equalsIgnoreCase(mode)) {
            return decimalValue(pricingNode, "totalCostUnitPrice");
        }
        if ("QUOTE".equalsIgnoreCase(mode)) {
            return decimalValue(pricingNode, "quotationUnitPrice");
        }
        if ("SIZE".equalsIgnoreCase(mode)) {
            return decimalValue(pricingNode, "sizeBasedUnitPrice");
        }
        return decimalValue(pricingNode, "processBasedUnitPrice");
    }

    private String buildReason(ProductionOrder order, JsonNode pricingNode) {
        BigDecimal scatterExtra = computeScatterExtra(order);
        StringBuilder builder = new StringBuilder();
        if ("EXTERNAL".equalsIgnoreCase(order.getFactoryType())) {
            builder.append("外发单优先参考整件成本价；");
        } else {
            builder.append("内部单优先参考工序单价；");
        }
        if (scatterExtra.compareTo(BigDecimal.ZERO) > 0) {
            builder.append("当前散剪会让单件成本额外增加 ").append(scatterExtra).append(" 元；");
        }
        BigDecimal suggested = decimalValue(pricingNode, "suggestedQuotationUnitPrice");
        if (suggested != null && suggested.compareTo(BigDecimal.ZERO) > 0) {
            builder.append("系统建议报价参考 ").append(suggested).append(" 元。");
        }
        return builder.toString();
    }
}
