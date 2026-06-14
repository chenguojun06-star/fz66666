package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.DeliveryPredictionService;
import com.fashion.supplychain.intelligence.service.RestockSuggestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/intelligence/prediction")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class IntelligencePredictionController {

    private final DeliveryPredictionService deliveryService;
    private final RestockSuggestionService restockService;

    @GetMapping("/delivery-risks")
    public Result<?> getDeliveryRisks(@RequestParam(defaultValue = "10") int topN) {
        return Result.success(deliveryService.predictRisks(UserContext.tenantId(), topN));
    }

    @GetMapping("/restock-suggestions")
    public Result<?> getRestockSuggestions(@RequestParam(defaultValue = "10") int topN) {
        return Result.success(restockService.getSuggestions(UserContext.tenantId(), topN));
    }
}
