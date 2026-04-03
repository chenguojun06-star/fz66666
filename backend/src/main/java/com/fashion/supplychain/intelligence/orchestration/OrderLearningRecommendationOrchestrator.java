package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.OrderLearningRecommendationResponse;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import com.fashion.supplychain.intelligence.entity.OrderLearningOutcome;
import com.fashion.supplychain.intelligence.service.OrderDecisionSnapshotService;
import com.fashion.supplychain.intelligence.service.OrderLearningOutcomeService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class OrderLearningRecommendationOrchestrator {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final ProductionOrderService productionOrderService;
    private final OrderDecisionSnapshotService orderDecisionSnapshotService;
    private final OrderLearningOutcomeService orderLearningOutcomeService;
    private final OrderDecisionCaptureOrchestrator orderDecisionCaptureOrchestrator;
    private final OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;
    private final OrderLearningFactoryScoreOrchestrator orderLearningFactoryScoreOrchestrator;
    private final OrderLearningSimilarStyleOrchestrator orderLearningSimilarStyleOrchestrator;
    public OrderLearningRecommendationResponse buildRecommendation(
            String styleNo,
            Integer orderQuantity,
            String currentFactoryMode,
            String currentPricingMode,
            BigDecimal currentUnitPrice
    ) {
        OrderLearningRecommendationResponse response = new OrderLearningRecommendationResponse();
        response.setStyleNo(styleNo);
        response.setCurrentFactoryMode(currentFactoryMode);
        response.setCurrentPricingMode(currentPricingMode);
        response.setCurrentUnitPrice(currentUnitPrice);
        if (!StringUtils.hasText(styleNo)) {
            response.setRecommendationTitle("AI 学习建议暂不可用");
            response.setRecommendationSummary("当前还没有款号，暂时无法做同款学习推荐。");
            response.setConfidenceLevel("low");
            return response;
        }

        List<OrderDecisionSnapshot> snapshots = loadSnapshots(styleNo);
        if (snapshots.isEmpty()) {
            hydrateFallbackSnapshots(styleNo);
            snapshots = loadSnapshots(styleNo);
        }
        Map<String, OrderLearningOutcome> outcomeMap = loadOutcomeMap(snapshots);

        response.setHasLearningData(!snapshots.isEmpty());
        response.setSameStyleCaseCount(snapshots.size());
        response.setRecentCases(buildRecentCases(snapshots, outcomeMap));
        response.setRecommendationTags(buildTags(snapshots, orderQuantity));
        response.setFactoryScores(orderLearningFactoryScoreOrchestrator.buildFactoryScores(snapshots, outcomeMap));
        response.setSimilarStyleCases(orderLearningSimilarStyleOrchestrator.buildSimilarCases(
                styleNo,
                snapshots.isEmpty() ? null : snapshots.get(0).getStyleCategory()
        ));

        if (snapshots.isEmpty()) {
            response.setRecommendationTitle("AI 正在积累首批样本");
            response.setRecommendationSummary("当前还没有同款下单学习记录，建议先按报价/成本规则下单，系统会从这次订单开始积累学习数据。");
            response.setRecommendedFactoryMode(StringUtils.hasText(currentFactoryMode) ? currentFactoryMode : "INTERNAL");
            response.setRecommendedPricingMode("PROCESS");
            response.setConfidenceLevel("low");
            response.setCostInsight("首单阶段先记录本次工厂、单价模式、实际履约结果。");
            response.setDeliveryInsight("首单完成后，系统即可在下次同款下单时提示历史结果。");
            response.setRiskInsight("先保证本次数据完整录入，学习效果会从第二单开始体现。");
            response.setActionSuggestion("先完成本次下单与履约回流，系统会从第二次同款下单开始给出更具体的成本与交期对比。");
            return response;
        }

        RecommendationAggregate factoryAggregate = buildFactoryAggregate(snapshots, outcomeMap);
        RecommendationAggregate pricingAggregate = buildPricingAggregate(snapshots, outcomeMap);
        BigDecimal recommendedUnitPrice = pricingAggregate.avgUnitPrice;
        String confidenceLevel = snapshots.size() >= 5 ? "high" : snapshots.size() >= 3 ? "medium" : "low";
        int delayedCount = (int) outcomeMap.values().stream().filter(item -> item != null && Integer.valueOf(0).compareTo(item.getDelayDays() == null ? 0 : item.getDelayDays()) < 0).count();
        BigDecimal avgScatter = avgScatterExtra(snapshots);

        response.setRecommendationTitle("AI 学习建议");
        response.setRecommendationSummary(buildSummary(factoryAggregate, pricingAggregate, snapshots.size(), delayedCount));
        response.setRecommendedFactoryMode(factoryAggregate.key);
        response.setRecommendedPricingMode(pricingAggregate.key);
        response.setRecommendedUnitPrice(recommendedUnitPrice);
        response.setConfidenceLevel(confidenceLevel);
        response.setCostInsight(buildCostInsight(pricingAggregate, avgScatter));
        response.setDeliveryInsight(buildDeliveryInsight(factoryAggregate, delayedCount, snapshots.size()));
        response.setRiskInsight(buildRiskInsight(currentFactoryMode, factoryAggregate.key, avgScatter, orderQuantity));
        response.setFactoryModeAligned(!StringUtils.hasText(currentFactoryMode) || currentFactoryMode.equalsIgnoreCase(factoryAggregate.key));
        response.setPricingModeAligned(!StringUtils.hasText(currentPricingMode) || currentPricingMode.equalsIgnoreCase(pricingAggregate.key));
        response.setGapInsight(buildGapInsight(currentFactoryMode, factoryAggregate.key, currentPricingMode, pricingAggregate.key, currentUnitPrice, recommendedUnitPrice, orderQuantity));
        response.setActionSuggestion(buildActionSuggestion(currentFactoryMode, factoryAggregate.key, currentPricingMode, pricingAggregate.key, currentUnitPrice, recommendedUnitPrice, orderQuantity));
        response.setExtraUnitCostIfKeepCurrent(calcExtraUnitCost(currentUnitPrice, recommendedUnitPrice));
        response.setExtraTotalCostIfKeepCurrent(calcExtraTotalCost(currentUnitPrice, recommendedUnitPrice, orderQuantity));
        return response;
    }

    private List<OrderDecisionSnapshot> loadSnapshots(String styleNo) {
        return orderDecisionSnapshotService.list(new LambdaQueryWrapper<OrderDecisionSnapshot>()
                .eq(OrderDecisionSnapshot::getTenantId, UserContext.tenantId())
                .eq(OrderDecisionSnapshot::getStyleNo, styleNo)
                .orderByDesc(OrderDecisionSnapshot::getCreateTime)
                .last("limit 8"));
    }

    private void hydrateFallbackSnapshots(String styleNo) {
        List<ProductionOrder> orders = productionOrderService.list(new LambdaQueryWrapper<ProductionOrder>()
                .eq(ProductionOrder::getTenantId, UserContext.tenantId())
                .eq(ProductionOrder::getStyleNo, styleNo)
                .orderByDesc(ProductionOrder::getCreateTime)
                .last("limit 5"));
        for (ProductionOrder order : orders) {
            orderDecisionCaptureOrchestrator.capture(order);
            orderLearningOutcomeOrchestrator.refreshByOrderId(order.getId());
        }
    }

    private Map<String, OrderLearningOutcome> loadOutcomeMap(List<OrderDecisionSnapshot> snapshots) {
        Set<String> orderIds = new LinkedHashSet<>();
        for (OrderDecisionSnapshot snapshot : snapshots) {
            if (StringUtils.hasText(snapshot.getOrderId())) {
                orderIds.add(snapshot.getOrderId());
            }
        }
        if (orderIds.isEmpty()) {
            return new HashMap<>();
        }
        List<OrderLearningOutcome> outcomes = orderLearningOutcomeService.list(new LambdaQueryWrapper<OrderLearningOutcome>()
                .eq(OrderLearningOutcome::getTenantId, UserContext.tenantId())
                .in(OrderLearningOutcome::getOrderId, orderIds));
        Map<String, OrderLearningOutcome> outcomeMap = new HashMap<>();
        for (OrderLearningOutcome outcome : outcomes) {
            outcomeMap.put(outcome.getOrderId(), outcome);
        }
        return outcomeMap;
    }

    private List<OrderLearningRecommendationResponse.OrderLearningCaseItem> buildRecentCases(
            List<OrderDecisionSnapshot> snapshots,
            Map<String, OrderLearningOutcome> outcomeMap
    ) {
        List<OrderLearningRecommendationResponse.OrderLearningCaseItem> cases = new ArrayList<>();
        for (OrderDecisionSnapshot snapshot : snapshots) {
            OrderLearningRecommendationResponse.OrderLearningCaseItem item = new OrderLearningRecommendationResponse.OrderLearningCaseItem();
            item.setOrderNo(snapshot.getOrderNo());
            item.setFactoryMode(snapshot.getFactoryMode());
            item.setFactoryName(snapshot.getFactoryName());
            item.setPricingMode(snapshot.getSelectedPricingMode());
            item.setSelectedUnitPrice(snapshot.getSelectedOrderUnitPrice());
            item.setTotalCostUnitPrice(snapshot.getTotalCostUnitPrice());
            item.setOrderQuantity(snapshot.getOrderQuantity());
            item.setScatterExtraPerPiece(snapshot.getScatterExtraPerPiece());
            item.setCreatedAt(snapshot.getCreateTime() == null ? null : snapshot.getCreateTime().format(TIME_FORMATTER));
            OrderLearningOutcome outcome = outcomeMap.get(snapshot.getOrderId());
            if (outcome != null) {
                item.setActualUnitCost(outcome.getActualUnitCost());
                item.setDelayDays(outcome.getDelayDays());
                item.setOutcomeSummary(outcome.getOutcomeSummary());
            } else {
                item.setOutcomeSummary("该单结果仍在持续学习中");
            }
            cases.add(item);
        }
        return cases;
    }

    private List<String> buildTags(List<OrderDecisionSnapshot> snapshots, Integer orderQuantity) {
        List<String> tags = new ArrayList<>();
        tags.add("同款历史 " + snapshots.size() + " 单");
        if (orderQuantity != null && orderQuantity > 0) {
            tags.add("本次数量 " + orderQuantity + " 件");
        }
        BigDecimal avgScatter = avgScatterExtra(snapshots);
        if (avgScatter.compareTo(BigDecimal.ZERO) > 0) {
            tags.add("散剪敏感");
        } else {
            tags.add("散剪稳定");
        }
        return tags;
    }

    private RecommendationAggregate buildFactoryAggregate(List<OrderDecisionSnapshot> snapshots, Map<String, OrderLearningOutcome> outcomeMap) {
        Map<String, RecommendationAggregate> aggregateMap = new HashMap<>();
        for (OrderDecisionSnapshot snapshot : snapshots) {
            String key = StringUtils.hasText(snapshot.getFactoryMode()) ? snapshot.getFactoryMode() : "INTERNAL";
            RecommendationAggregate aggregate = aggregateMap.computeIfAbsent(key, RecommendationAggregate::new);
            aggregate.count++;
            aggregate.unitPriceTotal = aggregate.unitPriceTotal.add(zero(snapshot.getSelectedOrderUnitPrice()));
            OrderLearningOutcome outcome = outcomeMap.get(snapshot.getOrderId());
            if (outcome != null) {
                aggregate.delayTotal += Math.max(outcome.getDelayDays() == null ? 0 : outcome.getDelayDays(), 0);
            }
        }
        return aggregateMap.values().stream()
                .peek(RecommendationAggregate::finish)
                .min(Comparator.comparing((RecommendationAggregate item) -> item.delayAverage)
                        .thenComparing(item -> item.avgUnitPrice))
                .orElseGet(() -> new RecommendationAggregate("INTERNAL"));
    }

    private RecommendationAggregate buildPricingAggregate(List<OrderDecisionSnapshot> snapshots, Map<String, OrderLearningOutcome> outcomeMap) {
        Map<String, RecommendationAggregate> aggregateMap = new HashMap<>();
        for (OrderDecisionSnapshot snapshot : snapshots) {
            String key = StringUtils.hasText(snapshot.getSelectedPricingMode()) ? snapshot.getSelectedPricingMode() : "PROCESS";
            RecommendationAggregate aggregate = aggregateMap.computeIfAbsent(key, RecommendationAggregate::new);
            aggregate.count++;
            aggregate.unitPriceTotal = aggregate.unitPriceTotal.add(zero(snapshot.getSelectedOrderUnitPrice()));
            aggregate.scatterTotal = aggregate.scatterTotal.add(zero(snapshot.getScatterExtraPerPiece()));
            OrderLearningOutcome outcome = outcomeMap.get(snapshot.getOrderId());
            if (outcome != null && outcome.getCostDeviationRate() != null && outcome.getCostDeviationRate().compareTo(BigDecimal.ZERO) > 0) {
                aggregate.riskScore = aggregate.riskScore.add(outcome.getCostDeviationRate());
            }
        }
        return aggregateMap.values().stream()
                .peek(RecommendationAggregate::finish)
                .min(Comparator.comparing((RecommendationAggregate item) -> item.riskScore)
                        .thenComparing(item -> item.scatterAverage)
                        .thenComparing(item -> item.avgUnitPrice))
                .orElseGet(() -> new RecommendationAggregate("PROCESS"));
    }

    private BigDecimal avgScatterExtra(List<OrderDecisionSnapshot> snapshots) {
        if (snapshots.isEmpty()) {
            return BigDecimal.ZERO;
        }
        BigDecimal total = snapshots.stream()
                .map(OrderDecisionSnapshot::getScatterExtraPerPiece)
                .filter(Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return total.divide(BigDecimal.valueOf(snapshots.size()), 2, RoundingMode.HALF_UP);
    }

    private String buildSummary(RecommendationAggregate factoryAggregate, RecommendationAggregate pricingAggregate, int caseCount, int delayedCount) {
        return "系统基于最近 " + caseCount + " 单同款记录，建议优先走 "
                + translateFactoryMode(factoryAggregate.key)
                + " + " + translatePricingMode(pricingAggregate.key)
                + "；历史延期单 " + delayedCount + " 单。";
    }

    private String buildCostInsight(RecommendationAggregate pricingAggregate, BigDecimal avgScatter) {
        return translatePricingMode(pricingAggregate.key)
                + " 在历史同款里平均下单价约 ¥"
                + pricingAggregate.avgUnitPrice.setScale(2, RoundingMode.HALF_UP)
                + "/件；散剪额外成本均值约 ¥"
                + avgScatter.setScale(2, RoundingMode.HALF_UP)
                + "/件。";
    }

    private String buildDeliveryInsight(RecommendationAggregate factoryAggregate, int delayedCount, int caseCount) {
        return translateFactoryMode(factoryAggregate.key)
                + " 历史平均延期 "
                + factoryAggregate.delayAverage
                + " 天；"
                + caseCount
                + " 单里有 "
                + delayedCount
                + " 单发生延期。";
    }

    private String buildRiskInsight(String currentFactoryMode, String recommendedFactoryMode, BigDecimal avgScatter, Integer orderQuantity) {
        StringBuilder builder = new StringBuilder();
        if (StringUtils.hasText(currentFactoryMode) && !currentFactoryMode.equalsIgnoreCase(recommendedFactoryMode)) {
            builder.append("当前选择与历史最优路径不一致；");
        }
        if (avgScatter.compareTo(BigDecimal.ZERO) > 0) {
            builder.append("同款历史存在散剪加价，建议重点关注免散剪线；");
        }
        if (orderQuantity != null && orderQuantity > 0 && orderQuantity < 200) {
            builder.append("本次数量偏小，优先看凑单或拆单策略。");
        }
        return builder.length() == 0 ? "当前选择与历史经验基本一致。" : builder.toString();
    }

    private BigDecimal calcExtraUnitCost(BigDecimal currentUnitPrice, BigDecimal recommendedUnitPrice) {
        if (currentUnitPrice == null || recommendedUnitPrice == null) {
            return null;
        }
        BigDecimal diff = currentUnitPrice.subtract(recommendedUnitPrice);
        return diff.compareTo(BigDecimal.ZERO) > 0 ? diff.setScale(2, RoundingMode.HALF_UP) : BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal calcExtraTotalCost(BigDecimal currentUnitPrice, BigDecimal recommendedUnitPrice, Integer orderQuantity) {
        BigDecimal extraUnit = calcExtraUnitCost(currentUnitPrice, recommendedUnitPrice);
        if (extraUnit == null || orderQuantity == null || orderQuantity <= 0) {
            return null;
        }
        return extraUnit.multiply(BigDecimal.valueOf(orderQuantity)).setScale(2, RoundingMode.HALF_UP);
    }

    private String buildGapInsight(
            String currentFactoryMode,
            String recommendedFactoryMode,
            String currentPricingMode,
            String recommendedPricingMode,
            BigDecimal currentUnitPrice,
            BigDecimal recommendedUnitPrice,
            Integer orderQuantity
    ) {
        List<String> parts = new ArrayList<>();
        if (StringUtils.hasText(currentFactoryMode) && !currentFactoryMode.equalsIgnoreCase(recommendedFactoryMode)) {
            parts.add("当前生产方式不是历史最优");
        }
        if (StringUtils.hasText(currentPricingMode) && !currentPricingMode.equalsIgnoreCase(recommendedPricingMode)) {
            parts.add("当前单价口径不是历史最稳");
        }
        BigDecimal extraUnit = calcExtraUnitCost(currentUnitPrice, recommendedUnitPrice);
        if (extraUnit != null && extraUnit.compareTo(BigDecimal.ZERO) > 0) {
            parts.add("若继续当前选法，预计单件多花 ¥" + extraUnit.setScale(2, RoundingMode.HALF_UP));
        }
        BigDecimal extraTotal = calcExtraTotalCost(currentUnitPrice, recommendedUnitPrice, orderQuantity);
        if (extraTotal != null && extraTotal.compareTo(BigDecimal.ZERO) > 0) {
            parts.add("整单约多花 ¥" + extraTotal.setScale(2, RoundingMode.HALF_UP));
        }
        return parts.isEmpty() ? "当前选法与历史最优建议基本一致。" : String.join("；", parts) + "。";
    }

    private String buildActionSuggestion(
            String currentFactoryMode,
            String recommendedFactoryMode,
            String currentPricingMode,
            String recommendedPricingMode,
            BigDecimal currentUnitPrice,
            BigDecimal recommendedUnitPrice,
            Integer orderQuantity
    ) {
        BigDecimal extraTotal = calcExtraTotalCost(currentUnitPrice, recommendedUnitPrice, orderQuantity);
        if (extraTotal != null && extraTotal.compareTo(BigDecimal.ZERO) > 0) {
            return "建议切到 " + translateFactoryMode(recommendedFactoryMode) + " / " + translatePricingMode(recommendedPricingMode)
                    + "，预计可少花 ¥" + extraTotal.setScale(2, RoundingMode.HALF_UP) + "。";
        }
        if (StringUtils.hasText(currentFactoryMode) && !currentFactoryMode.equalsIgnoreCase(recommendedFactoryMode)) {
            return "建议优先改成 " + translateFactoryMode(recommendedFactoryMode) + "，历史交期和成本表现更稳。";
        }
        if (StringUtils.hasText(currentPricingMode) && !currentPricingMode.equalsIgnoreCase(recommendedPricingMode)) {
            return "建议优先改成 " + translatePricingMode(recommendedPricingMode) + "，历史偏差更小。";
        }
        return "当前方案已接近历史最优，可以继续按当前方案下单。";
    }

    private BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private String translateFactoryMode(String factoryMode) {
        return "EXTERNAL".equalsIgnoreCase(factoryMode) ? "外发加工" : "内部工厂";
    }

    private String translatePricingMode(String pricingMode) {
        if ("COST".equalsIgnoreCase(pricingMode)) {
            return "外发整件单价";
        }
        if ("QUOTE".equalsIgnoreCase(pricingMode)) {
            return "报价单价";
        }
        if ("SIZE".equalsIgnoreCase(pricingMode)) {
            return "尺码单价";
        }
        if ("MANUAL".equalsIgnoreCase(pricingMode)) {
            return "手动单价";
        }
        return "工序单价";
    }

    private static class RecommendationAggregate {
        private final String key;
        private int count;
        private int delayTotal;
        private BigDecimal unitPriceTotal = BigDecimal.ZERO;
        private BigDecimal scatterTotal = BigDecimal.ZERO;
        private BigDecimal riskScore = BigDecimal.ZERO;
        private BigDecimal avgUnitPrice = BigDecimal.ZERO;
        private BigDecimal scatterAverage = BigDecimal.ZERO;
        private int delayAverage;

        private RecommendationAggregate(String key) {
            this.key = key;
        }

        private void finish() {
            if (count <= 0) {
                return;
            }
            avgUnitPrice = unitPriceTotal.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
            scatterAverage = scatterTotal.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
            delayAverage = delayTotal / count;
        }
    }
}
