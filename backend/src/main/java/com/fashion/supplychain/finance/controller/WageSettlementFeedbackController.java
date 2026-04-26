package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.WageSettlementFeedback;
import com.fashion.supplychain.finance.orchestration.WageSettlementFeedbackOrchestrator;
import lombok.AllArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/finance/wage-settlement-feedback")
@AllArgsConstructor
@PreAuthorize("isAuthenticated()")
public class WageSettlementFeedbackController {

    private final WageSettlementFeedbackOrchestrator feedbackOrchestrator;

    @PostMapping("/submit")
    public Result<WageSettlementFeedback> submitFeedback(@RequestBody Map<String, Object> params) {
        return Result.success(feedbackOrchestrator.submitFeedback(params));
    }

    @PostMapping("/my-list")
    public Result<List<WageSettlementFeedback>> listMyFeedback(@RequestBody(required = false) Map<String, Object> params) {
        return Result.success(feedbackOrchestrator.listMyFeedback(params != null ? params : Map.of()));
    }

    @PostMapping("/list")
    public Result<List<WageSettlementFeedback>> listAllFeedback(@RequestBody(required = false) Map<String, Object> params) {
        return Result.success(feedbackOrchestrator.listAllFeedback(params != null ? params : Map.of()));
    }

    @GetMapping("/stats")
    public Result<Map<String, Object>> getFeedbackStats() {
        return Result.success(feedbackOrchestrator.getFeedbackStats());
    }

    @PostMapping("/{id}/resolve")
    public Result<WageSettlementFeedback> resolveFeedback(
            @PathVariable String id,
            @RequestBody Map<String, Object> params) {
        return Result.success(feedbackOrchestrator.resolveFeedback(id, params));
    }
}
