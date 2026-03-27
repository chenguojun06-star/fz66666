package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.dto.OrderLearningRecommendationResponse;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningOutcomeOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningRefreshOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.OrderLearningRecommendationOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intelligence/order-learning")
@RequiredArgsConstructor
public class OrderLearningController {

    private final OrderLearningRecommendationOrchestrator orderLearningRecommendationOrchestrator;
    private final OrderLearningOutcomeOrchestrator orderLearningOutcomeOrchestrator;
    private final OrderLearningRefreshOrchestrator orderLearningRefreshOrchestrator;

    @GetMapping("/recommendation")
    public Result<OrderLearningRecommendationResponse> getRecommendation(
            @RequestParam String styleNo,
            @RequestParam(required = false) Integer orderQuantity,
            @RequestParam(required = false) String factoryMode,
            @RequestParam(required = false) String pricingMode,
            @RequestParam(required = false) java.math.BigDecimal currentUnitPrice
    ) {
        return Result.success(orderLearningRecommendationOrchestrator.buildRecommendation(styleNo, orderQuantity, factoryMode, pricingMode, currentUnitPrice));
    }

    @PostMapping("/outcome/refresh")
    public Result<Boolean> refreshOutcome(@RequestParam String orderId) {
        orderLearningOutcomeOrchestrator.refreshByOrderId(orderId);
        return Result.success(true);
    }

    @PostMapping("/refresh/recent")
    public Result<Integer> refreshRecent(@RequestParam(defaultValue = "50") Integer limit) {
        return Result.success(orderLearningRefreshOrchestrator.refreshRecentOrdersForCurrentTenant(limit == null ? 50 : limit));
    }

    @PostMapping("/refresh/style")
    public Result<Integer> refreshStyle(
            @RequestParam String styleNo,
            @RequestParam(defaultValue = "50") Integer limit
    ) {
        return Result.success(orderLearningRefreshOrchestrator.refreshStyleOrdersForCurrentTenant(styleNo, limit == null ? 50 : limit));
    }
}
