package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.OrderLearningRecommendationResponse;
import com.fashion.supplychain.intelligence.entity.OrderDecisionSnapshot;
import com.fashion.supplychain.intelligence.entity.OrderLearningOutcome;
import com.fashion.supplychain.intelligence.service.OrderDecisionSnapshotService;
import com.fashion.supplychain.intelligence.service.OrderLearningOutcomeService;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class OrderLearningSimilarStyleOrchestrator {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final OrderDecisionSnapshotService orderDecisionSnapshotService;
    private final OrderLearningOutcomeService orderLearningOutcomeService;

    public List<OrderLearningRecommendationResponse.SimilarStyleCaseItem> buildSimilarCases(String styleNo, String styleCategory) {
        if (!StringUtils.hasText(styleCategory)) {
            return new ArrayList<>();
        }
        List<OrderDecisionSnapshot> snapshots = orderDecisionSnapshotService.list(new LambdaQueryWrapper<OrderDecisionSnapshot>()
                .eq(OrderDecisionSnapshot::getTenantId, UserContext.tenantId())
                .eq(OrderDecisionSnapshot::getStyleCategory, styleCategory)
                .ne(OrderDecisionSnapshot::getStyleNo, styleNo)
                .orderByDesc(OrderDecisionSnapshot::getCreateTime)
                .last("limit 6"));
        if (snapshots.isEmpty()) {
            return new ArrayList<>();
        }
        Set<String> orderIds = new LinkedHashSet<>();
        for (OrderDecisionSnapshot snapshot : snapshots) {
            if (StringUtils.hasText(snapshot.getOrderId())) {
                orderIds.add(snapshot.getOrderId());
            }
        }
        Map<String, OrderLearningOutcome> outcomeMap = orderLearningOutcomeService.list(new LambdaQueryWrapper<OrderLearningOutcome>()
                        .eq(OrderLearningOutcome::getTenantId, UserContext.tenantId())
                        .in(!orderIds.isEmpty(), OrderLearningOutcome::getOrderId, orderIds))
                .stream()
                .collect(java.util.stream.Collectors.toMap(OrderLearningOutcome::getOrderId, item -> item, (a, b) -> a));

        List<OrderLearningRecommendationResponse.SimilarStyleCaseItem> items = new ArrayList<>();
        for (OrderDecisionSnapshot snapshot : snapshots) {
            OrderLearningRecommendationResponse.SimilarStyleCaseItem item = new OrderLearningRecommendationResponse.SimilarStyleCaseItem();
            item.setStyleNo(snapshot.getStyleNo());
            item.setStyleName(snapshot.getStyleName());
            item.setFactoryMode(snapshot.getFactoryMode());
            item.setPricingMode(snapshot.getSelectedPricingMode());
            item.setSelectedUnitPrice(snapshot.getSelectedOrderUnitPrice());
            item.setOrderQuantity(snapshot.getOrderQuantity());
            item.setScatterExtraPerPiece(snapshot.getScatterExtraPerPiece());
            item.setCreatedAt(snapshot.getCreateTime() == null ? null : snapshot.getCreateTime().format(TIME_FORMATTER));
            OrderLearningOutcome outcome = outcomeMap.get(snapshot.getOrderId());
            item.setOutcomeSummary(outcome == null ? "该相似单结果仍在学习中" : outcome.getOutcomeSummary());
            items.add(item);
        }
        return items;
    }
}
