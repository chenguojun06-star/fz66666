package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.AiAccuracyDashboardResponse;
import com.fashion.supplychain.intelligence.orchestration.AiAccuracyOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * AI 准确率量化接口（独立 Controller，不往 IntelligenceController 中堆）
 *
 * <p>提供三大可对外展示的商业说服指标：
 * <ul>
 *   <li>GET /api/intelligence/accuracy/dashboard  — 主仪表板数据</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/intelligence/accuracy")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class AiAccuracyController {

    private final AiAccuracyOrchestrator aiAccuracyOrchestrator;

    /**
     * 获取 AI 准确率仪表板数据。
     *
     * @param toleranceDays 交期命中容差（天），默认 2
     * @param recentDays    采纳率统计时间窗口（天），默认 90
     */
    @GetMapping("/dashboard")
    public Result<AiAccuracyDashboardResponse> getDashboard(
            @RequestParam(defaultValue = "2")  int toleranceDays,
            @RequestParam(defaultValue = "90") int recentDays) {

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        AiAccuracyDashboardResponse resp =
                aiAccuracyOrchestrator.computeDashboard(tenantId, toleranceDays, recentDays);
        return Result.success(resp);
    }
}
