package com.fashion.supplychain.intelligence.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.intelligence.entity.AiPlatformAggregate;
import com.fashion.supplychain.intelligence.orchestration.DecisionCardOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PatrolClosedLoopOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.PlatformIntelligenceOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ProcessRewardOrchestrator;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 平台级 AI 数据 Controller（仅云裳智链超管可见）
 * <p>提供跨租户聚合视图：工具命中率、决策采纳率、巡检 MTTR、平台级度量。
 * <br>普通租户与租户主账号均无权访问；本接口供平台运营/训练数据采集使用。</p>
 */
@RestController
@RequestMapping("/api/intelligence/platform")
@PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
public class PlatformIntelligenceController {

    @Autowired
    private PlatformIntelligenceOrchestrator platformOrchestrator;

    @Autowired
    private ProcessRewardOrchestrator rewardOrchestrator;

    @Autowired
    private DecisionCardOrchestrator decisionCardOrchestrator;

    @Autowired
    private PatrolClosedLoopOrchestrator patrolOrchestrator;

    /**
     * 综合面板：跨租户工具表现 + 采纳率 + MTTR
     */
    @GetMapping("/super-dashboard")
    public Result<Map<String, Object>> superDashboard(
            @RequestParam(defaultValue = "30") int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, Math.min(days, 365)));
        return Result.success(platformOrchestrator.superDashboard(since));
    }

    @GetMapping("/tool-performance")
    public Result<List<Map<String, Object>>> toolPerformance(
            @RequestParam(defaultValue = "30") int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, Math.min(days, 365)));
        return Result.success(rewardOrchestrator.aggregateToolPerformance(since));
    }

    @GetMapping("/decision-adoption")
    public Result<List<Map<String, Object>>> decisionAdoption(
            @RequestParam(defaultValue = "30") int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, Math.min(days, 365)));
        return Result.success(decisionCardOrchestrator.aggregateAdoption(since));
    }

    @GetMapping("/patrol-mttr")
    public Result<List<Map<String, Object>>> patrolMttr(
            @RequestParam(defaultValue = "30") int days) {
        LocalDateTime since = LocalDateTime.now().minusDays(Math.max(1, Math.min(days, 365)));
        return Result.success(patrolOrchestrator.aggregateMttr(since));
    }

    @GetMapping("/aggregate-recent")
    public Result<List<AiPlatformAggregate>> aggregateRecent(
            @RequestParam(required = false) String metricKey,
            @RequestParam(defaultValue = "100") int limit) {
        return Result.success(platformOrchestrator.recent(metricKey, limit));
    }
}
