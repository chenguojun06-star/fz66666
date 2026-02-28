package com.fashion.supplychain.dashboard.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.dashboard.orchestration.DailyBriefOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 智能运营日报控制器
 */
@RestController
@RequestMapping("/api/dashboard")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class DailyBriefController {

    private final DailyBriefOrchestrator dailyBriefOrchestrator;

    /**
     * GET /api/dashboard/daily-brief
     * 返回当日运营日报：昨日业绩 + 今日风险 + 智能建议
     */
    @GetMapping("/daily-brief")
    public Result<Map<String, Object>> getDailyBrief() {
        return Result.success(dailyBriefOrchestrator.getBrief());
    }
}
