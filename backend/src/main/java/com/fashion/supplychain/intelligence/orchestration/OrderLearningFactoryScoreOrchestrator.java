package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.OrderLearningRecommendationResponse;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import com.fashion.supplychain.intelligence.entity.OrderLearningOutcome;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class OrderLearningFactoryScoreOrchestrator {

    public List<OrderLearningRecommendationResponse.FactoryScoreItem> buildFactoryScores(
            List<OrderDecisionSnapshot> snapshots,
            Map<String, OrderLearningOutcome> outcomeMap
    ) {
        Map<String, FactoryScoreAggregate> aggregateMap = new LinkedHashMap<>();
        for (OrderDecisionSnapshot snapshot : snapshots) {
            String factoryMode = StringUtils.hasText(snapshot.getFactoryMode()) ? snapshot.getFactoryMode() : "INTERNAL";
            String factoryName = StringUtils.hasText(snapshot.getFactoryName()) ? snapshot.getFactoryName() : ("EXTERNAL".equalsIgnoreCase(factoryMode) ? "外发工厂" : "内部自产");
            String key = factoryMode + "|" + factoryName;
            FactoryScoreAggregate aggregate = aggregateMap.computeIfAbsent(key, unused -> new FactoryScoreAggregate(factoryMode, factoryName));
            aggregate.count++;
            aggregate.unitPriceTotal = aggregate.unitPriceTotal.add(zero(snapshot.getSelectedOrderUnitPrice()));
            OrderLearningOutcome outcome = outcomeMap.get(snapshot.getOrderId());
            if (outcome != null) {
                aggregate.delayTotal += Math.max(outcome.getDelayDays() == null ? 0 : outcome.getDelayDays(), 0);
                aggregate.outcomeScoreTotal = aggregate.outcomeScoreTotal.add(zero(outcome.getOutcomeScore()));
            }
        }
        List<OrderLearningRecommendationResponse.FactoryScoreItem> items = new ArrayList<>();
        aggregateMap.values().stream()
                .peek(FactoryScoreAggregate::finish)
                .sorted(Comparator.comparing(FactoryScoreAggregate::sortScore).reversed())
                .limit(4)
                .forEach(aggregate -> {
                    OrderLearningRecommendationResponse.FactoryScoreItem item = new OrderLearningRecommendationResponse.FactoryScoreItem();
                    item.setFactoryMode(aggregate.factoryMode);
                    item.setFactoryName(aggregate.factoryName);
                    item.setOrderCount(aggregate.count);
                    item.setAvgUnitPrice(aggregate.avgUnitPrice);
                    item.setAvgDelayDays(aggregate.avgDelayDays);
                    item.setAvgOutcomeScore(aggregate.avgOutcomeScore);
                    item.setScoreSummary(buildSummary(aggregate));
                    items.add(item);
                });
        return items;
    }

    private String buildSummary(FactoryScoreAggregate aggregate) {
        return aggregate.factoryName
                + " 历史 " + aggregate.count + " 单，均价 ¥" + aggregate.avgUnitPrice.setScale(2, RoundingMode.HALF_UP)
                + "/件，平均延期 " + aggregate.avgDelayDays + " 天，综合分 "
                + aggregate.avgOutcomeScore.setScale(1, RoundingMode.HALF_UP);
    }

    private BigDecimal zero(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static class FactoryScoreAggregate {
        private final String factoryMode;
        private final String factoryName;
        private int count;
        private int delayTotal;
        private BigDecimal unitPriceTotal = BigDecimal.ZERO;
        private BigDecimal outcomeScoreTotal = BigDecimal.ZERO;
        private BigDecimal avgUnitPrice = BigDecimal.ZERO;
        private BigDecimal avgOutcomeScore = BigDecimal.ZERO;
        private int avgDelayDays;

        private FactoryScoreAggregate(String factoryMode, String factoryName) {
            this.factoryMode = factoryMode;
            this.factoryName = factoryName;
        }

        private void finish() {
            if (count <= 0) {
                return;
            }
            avgUnitPrice = unitPriceTotal.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
            avgOutcomeScore = outcomeScoreTotal.divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
            avgDelayDays = delayTotal / count;
        }

        private BigDecimal sortScore() {
            return avgOutcomeScore.subtract(BigDecimal.valueOf(avgDelayDays));
        }
    }
}
