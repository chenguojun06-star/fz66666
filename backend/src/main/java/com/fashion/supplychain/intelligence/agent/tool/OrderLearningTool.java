package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.OrderLearningRecommendationResponse;
import com.fashion.supplychain.intelligence.orchestration.OrderDecisionCaptureOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningOutcomeOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningRefreshOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningRecommendationOrchestrator;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class OrderLearningTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderDecisionCaptureOrchestrator orderDecisionCaptureOrchestrator;

    @Autowired
    private OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;

    @Autowired
    private OrderLearningRecommendationOrchestrator orderLearningRecommendationOrchestrator;

    @Autowired
    private OrderLearningRefreshOrchestrator orderLearningRefreshOrchestrator;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", schema("string", "操作类型：recommend(学习建议)/explain_order(解释这单实际价格)/refresh_outcome(刷新单笔学习结果)/refresh_recent(刷新近期订单学习结果)/refresh_style(刷新某款历史学习样本)", List.of("recommend", "explain_order", "refresh_outcome", "refresh_recent", "refresh_style")));
        properties.put("styleNo", schema("string", "款号，recommend/explain_order/refresh_style 可传"));
        properties.put("orderNo", schema("string", "订单号，explain_order/refresh_outcome 优先传"));
        properties.put("orderId", schema("string", "订单ID，可选"));
        properties.put("orderQuantity", schema("integer", "下单件数，可选"));
        properties.put("limit", schema("integer", "批量刷新数量上限，refresh_recent/refresh_style 可传，默认 50"));
        properties.put("factoryMode", schema("string", "当前生产方式 INTERNAL/EXTERNAL，可选"));
        properties.put("pricingMode", schema("string", "当前单价口径 PROCESS/SIZE/COST/QUOTE/MANUAL，可选"));
        properties.put("currentUnitPrice", schema("number", "当前下单单价，可选"));

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("下单学习与事件处理工具。可以分析这单实际价格(工厂单价/计价方式/数量等)、为什么贵、推荐更优生产方式和单价口径、刷新完工学习结果，也可以批量刷新近期订单或某个款号的学习样本。" +
                "当用户问'这单多少钱'、'这个订单的价格'、'实际单价多少'、'帮我分析这单怎么下更划算'、'这单为什么成本高'、'刷新这单学习结果'、'把这个款号的学习样本重刷一下'时调用。");
        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        if (UserContext.factoryId() != null) {
            return MAPPER.writeValueAsString(Map.of("success", false, "error", "外发工厂账号无权使用下单学习功能"));
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        String action = String.valueOf(args.getOrDefault("action", "")).trim();
        if (!StringUtils.hasText(action)) {
            return MAPPER.writeValueAsString(Map.of("error", "缺少 action"));
        }
        ProductionOrder order = findOrder(args);
        if ("explain_order".equalsIgnoreCase(action)) {
            if (order == null) {
                return MAPPER.writeValueAsString(Map.of("error", "解释订单时需要有效订单号或订单ID"));
            }
            return explainOrder(order);
        }
        if ("refresh_outcome".equalsIgnoreCase(action)) {
            if (order == null) {
                return MAPPER.writeValueAsString(Map.of("error", "刷新学习结果时需要有效订单号或订单ID"));
            }
            orderDecisionCaptureOrchestrator.capture(order);
            orderLearningOutcomeOrchestrator.refreshByOrderId(order.getId());
            return MAPPER.writeValueAsString(Map.of(
                    "success", true,
                    "message", "已刷新该单的学习快照与履约结果",
                    "orderNo", order.getOrderNo(),
                    "orderId", order.getId()
            ));
        }
        Integer limit = integerValue(args.get("limit"));
        int effectiveLimit = limit == null || limit <= 0 ? 50 : limit;
        if ("refresh_recent".equalsIgnoreCase(action)) {
            int refreshed = orderLearningRefreshOrchestrator.refreshRecentOrdersForCurrentTenant(effectiveLimit);
            return MAPPER.writeValueAsString(Map.of(
                    "success", true,
                    "message", "已刷新近期订单学习结果",
                    "refreshedCount", refreshed,
                    "limit", effectiveLimit
            ));
        }

        String styleNo = stringValue(args.get("styleNo"));
        if (!StringUtils.hasText(styleNo) && order != null) {
            styleNo = order.getStyleNo();
        }
        if ("refresh_style".equalsIgnoreCase(action)) {
            if (!StringUtils.hasText(styleNo)) {
                return MAPPER.writeValueAsString(Map.of("error", "刷新款号学习样本时需要 styleNo"));
            }
            int refreshed = orderLearningRefreshOrchestrator.refreshStyleOrdersForCurrentTenant(styleNo, effectiveLimit);
            return MAPPER.writeValueAsString(Map.of(
                    "success", true,
                    "message", "已刷新该款号的学习样本",
                    "styleNo", styleNo,
                    "refreshedCount", refreshed,
                    "limit", effectiveLimit
            ));
        }
        if (!StringUtils.hasText(styleNo)) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供 styleNo 或可定位到订单的 orderNo/orderId"));
        }
        Integer orderQuantity = integerValue(args.get("orderQuantity"));
        if (orderQuantity == null && order != null) {
            orderQuantity = order.getOrderQuantity();
        }
        String factoryMode = stringValue(args.get("factoryMode"));
        if (!StringUtils.hasText(factoryMode) && order != null) {
            factoryMode = order.getFactoryType();
        }
        String pricingMode = stringValue(args.get("pricingMode"));
        if (!StringUtils.hasText(pricingMode) && order != null) {
            pricingMode = order.getPricingMode();
        }
        BigDecimal currentUnitPrice = decimalValue(args.get("currentUnitPrice"));
        if (currentUnitPrice == null && order != null) {
            currentUnitPrice = order.getFactoryUnitPrice();
        }
        OrderLearningRecommendationResponse recommendation = orderLearningRecommendationOrchestrator.buildRecommendation(
                styleNo,
                orderQuantity,
                factoryMode,
                pricingMode,
                currentUnitPrice
        );
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("styleNo", styleNo);
        result.put("orderNo", order == null ? null : order.getOrderNo());
        result.put("summary", recommendation.getRecommendationSummary());
        result.put("gapInsight", recommendation.getGapInsight());
        result.put("actionSuggestion", recommendation.getActionSuggestion());
        result.put("recommendedFactoryMode", recommendation.getRecommendedFactoryMode());
        result.put("recommendedPricingMode", recommendation.getRecommendedPricingMode());
        result.put("recommendedUnitPrice", recommendation.getRecommendedUnitPrice());
        result.put("extraUnitCostIfKeepCurrent", recommendation.getExtraUnitCostIfKeepCurrent());
        result.put("extraTotalCostIfKeepCurrent", recommendation.getExtraTotalCostIfKeepCurrent());
        result.put("factoryScores", recommendation.getFactoryScores());
        result.put("similarStyleCases", recommendation.getSimilarStyleCases());
        return MAPPER.writeValueAsString(result);
    }

    @Override
    public String getName() {
        return "tool_order_learning";
    }

    private Map<String, Object> schema(String type, String description) {
        return schema(type, description, null);
    }

    private Map<String, Object> schema(String type, String description, List<String> enumValues) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("type", type);
        item.put("description", description);
        if (enumValues != null && !enumValues.isEmpty()) {
            item.put("enum", enumValues);
        }
        return item;
    }

    private ProductionOrder findOrder(Map<String, Object> args) {
        String orderId = stringValue(args.get("orderId"));
        if (StringUtils.hasText(orderId)) {
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            return productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, orderId)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
        }
        String orderNo = stringValue(args.get("orderNo"));
        if (!StringUtils.hasText(orderNo)) {
            return null;
        }
        return productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                .eq(ProductionOrder::getOrderNo, orderNo)
                .last("limit 1"), false);
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value).trim();
    }

    private Integer integerValue(Object value) {
        try {
            return value == null ? null : Integer.parseInt(String.valueOf(value));
        } catch (Exception ex) {
            log.debug("[OrderLearning] integerValue解析失败: value={}", value);
            return null;
        }
    }

    private BigDecimal decimalValue(Object value) {
        try {
            return value == null ? null : new BigDecimal(String.valueOf(value));
        } catch (Exception ex) {
            log.debug("[OrderLearning] decimalValue解析失败: value={}", value);
            return null;
        }
    }

    private String explainOrder(ProductionOrder order) throws Exception {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("orderNo", order.getOrderNo());
        data.put("orderId", order.getId());
        data.put("styleNo", order.getStyleNo());
        data.put("styleName", order.getStyleName());
        data.put("orderQuantity", order.getOrderQuantity());
        data.put("factoryType", order.getFactoryType());
        data.put("factoryName", order.getFactoryName());
        data.put("pricingMode", order.getPricingMode());

        BigDecimal unitPrice = order.getFactoryUnitPrice();
        data.put("unitPrice", unitPrice);
        if (unitPrice != null && order.getOrderQuantity() != null && order.getOrderQuantity() > 0) {
            data.put("totalPrice", unitPrice.multiply(BigDecimal.valueOf(order.getOrderQuantity())));
        }

        data.put("completedQuantity", order.getCompletedQuantity());
        data.put("status", order.getStatus());
        data.put("productionProgress", order.getProductionProgress());
        data.put("urgencyLevel", order.getUrgencyLevel());
        data.put("productCategory", order.getProductCategory());
        data.put("createTime", order.getCreateTime() != null ? order.getCreateTime().toString() : null);
        data.put("actualEndDate", order.getActualEndDate() != null ? order.getActualEndDate().toString() : null);
        data.put("createdByName", order.getCreatedByName());

        data.put("summary", String.format(
                "订单 %s（款号 %s），%s，数量 %d 件，工厂单价 %s，计价方式 %s，状态 %s，进度 %d%%",
                order.getOrderNo(), order.getStyleNo(), order.getStyleName(),
                order.getOrderQuantity() != null ? order.getOrderQuantity() : 0,
                unitPrice != null ? unitPrice.toString() : "未设置",
                order.getPricingMode() != null ? order.getPricingMode() : "未设置",
                order.getStatus(), order.getProductionProgress() != null ? order.getProductionProgress() : 0));

        return MAPPER.writeValueAsString(Map.of("success", true, "data", data));
    }
}
