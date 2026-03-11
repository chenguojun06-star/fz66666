package com.fashion.supplychain.selection.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.selection.dto.StyleHistoryAnalysisDTO;
import com.fashion.supplychain.selection.entity.TrendSnapshot;
import com.fashion.supplychain.selection.orchestration.SelectionApprovalOrchestrator;
import com.fashion.supplychain.selection.orchestration.TrendAnalysisOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 趋势分析 + 历史分析 Controller
 * — 趋势快照查询/录入
 * — 历史款式分析
 * — AI选品建议
 */
@RestController
@RequestMapping("/api/selection/trend")
@PreAuthorize("isAuthenticated()")
public class TrendAnalysisController {

    @Autowired
    private TrendAnalysisOrchestrator trendOrchestrator;

    @Autowired
    private SelectionApprovalOrchestrator approvalOrchestrator;

    /** 趋势快照列表 */
    @GetMapping("/latest")
    public Result<List<TrendSnapshot>> latest(
            @RequestParam(required = false) String trendType,
            @RequestParam(required = false) String dataSource,
            @RequestParam(defaultValue = "60") int days) {
        return Result.success(trendOrchestrator.listTrends(trendType, dataSource, days));
    }

    /** 手动录入趋势数据 */
    @PostMapping("/manual")
    public Result<TrendSnapshot> addManual(@RequestBody Map<String, Object> body) {
        String trendType = (String) body.get("trendType");
        String keyword = (String) body.get("keyword");
        Integer heatScore = body.get("heatScore") != null ? Integer.parseInt(body.get("heatScore").toString()) : 50;
        String summary = (String) body.get("summary");
        if (keyword == null || keyword.isEmpty()) {
            return Result.fail("关键词不能为空");
        }
        return Result.success(trendOrchestrator.addManualTrend(trendType, keyword, heatScore, summary));
    }

    /** 历史款式分析（内部数据聚合） */
    @PostMapping("/history/list")
    public Result<List<StyleHistoryAnalysisDTO>> historyList(@RequestBody(required = false) Map<String, Object> filters) {
        if (filters == null) filters = new HashMap<>();
        return Result.success(approvalOrchestrator.analyzeHistory(filters));
    }

    /** 畅销款 TOP N */
    @GetMapping("/top-styles")
    public Result<List<StyleHistoryAnalysisDTO>> topStyles(@RequestParam(defaultValue = "20") int top) {
        return Result.success(approvalOrchestrator.getTopStyles(top));
    }

    /** AI选品策略建议 */
    @PostMapping("/ai-suggestion")
    public Result<Map<String, Object>> aiSuggestion(@RequestBody Map<String, Object> body) {
        Integer year = body.get("year") != null ? Integer.parseInt(body.get("year").toString()) : null;
        String season = (String) body.getOrDefault("season", "");
        if (year == null) year = java.time.LocalDate.now().getYear();
        return Result.success(trendOrchestrator.generateSelectionSuggestion(year, season));
    }
}
