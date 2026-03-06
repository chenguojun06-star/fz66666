package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.orchestration.FeedbackReasonOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/intelligence/feedback-reason")
@PreAuthorize("isAuthenticated()")
public class FeedbackReasonController {

    @Autowired
    private FeedbackReasonOrchestrator feedbackReasonOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam(defaultValue = "20") int limit) {
        return Result.success(feedbackReasonOrchestrator.listCurrentTenantFeedbackReasons(limit));
    }
}
