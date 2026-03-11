package com.fashion.supplychain.selection.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.selection.dto.StyleHistoryAnalysisDTO;
import com.fashion.supplychain.selection.entity.SelectionCandidate;
import com.fashion.supplychain.selection.entity.TrendSnapshot;
import com.fashion.supplychain.selection.service.SelectionCandidateService;
import com.fashion.supplychain.selection.service.SerpApiTrendService;
import com.fashion.supplychain.selection.service.TrendSnapshotService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 趋势分析 + AI打分编排器
 * — 拉取/展示趋势快照
 * — AI给候选款打趋势契合分（复用 IntelligenceInferenceOrchestrator）
 * — 基于内部历史数据生成AI选品建议
 */
@Service
@Slf4j
public class TrendAnalysisOrchestrator {

    @Autowired
    private TrendSnapshotService snapshotService;

    @Autowired
    private SelectionCandidateService candidateService;

    @Autowired(required = false)
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private SelectionApprovalOrchestrator approvalOrchestrator;

    @Autowired(required = false)
    private SerpApiTrendService serpApiTrendService;

    @Autowired
    private ObjectMapper objectMapper;

    /** 查询趋势快照列表 */
    public List<TrendSnapshot> listTrends(String trendType, String dataSource, int days) {
        Long tenantId = UserContext.tenantId();
        LocalDate since = LocalDate.now().minusDays(days);
        LambdaQueryWrapper<TrendSnapshot> wrapper = new LambdaQueryWrapper<TrendSnapshot>()
                .eq(TrendSnapshot::getTenantId, tenantId)
                .ge(TrendSnapshot::getSnapshotDate, since)
                .orderByDesc(TrendSnapshot::getSnapshotDate)
                .orderByDesc(TrendSnapshot::getHeatScore);

        if (trendType != null && !trendType.isEmpty()) wrapper.eq(TrendSnapshot::getTrendType, trendType);
        if (dataSource != null && !dataSource.isEmpty()) wrapper.eq(TrendSnapshot::getDataSource, dataSource);

        return snapshotService.list(wrapper);
    }

    /** 手动录入趋势数据 */
    public TrendSnapshot addManualTrend(String trendType, String keyword, Integer heatScore, String summary) {
        Long tenantId = UserContext.tenantId();
        TrendSnapshot snap = new TrendSnapshot();
        snap.setSnapshotDate(LocalDate.now());
        snap.setDataSource("MANUAL");
        snap.setTrendType(trendType);
        snap.setKeyword(keyword);
        snap.setHeatScore(heatScore);
        snap.setAiSummary(summary);
        snap.setPeriod("day");
        snap.setTenantId(tenantId);
        snapshotService.save(snap);
        return snap;
    }

    /**
     * AI给候选款打趋势契合分
     * 1. 先从 SerpApi 拉取该款式关键词的 Google Trends 实时热度（缓存24h）
     * 2. 将实时热度注入 AI Prompt，提升评分准确性
     * 3. 复用 DeepSeek 推理器进行综合评分
     */
    public Map<String, Object> scoreCandidateByAi(Long candidateId) {
        Long tenantId = UserContext.tenantId();
        SelectionCandidate candidate = candidateService.getById(candidateId);
        if (candidate == null || !candidate.getTenantId().equals(tenantId)) {
            throw new RuntimeException("候选款不存在");
        }

        // ① SerpApi：拉取该款式关键词的 Google Trends 实时热度
        String serpKeyword = buildTrendKeyword(candidate);
        int serpTrendScore = serpApiTrendService != null ? serpApiTrendService.fetchTrendScore(serpKeyword) : -1;
        String serpTrendContext = "";
        if (serpTrendScore >= 0) {
            serpTrendContext = "\nGoogle Trends 实时指数（近3个月, geo=CN）: "
                    + serpKeyword + " = " + serpTrendScore + "/100";
            // 自动保存为 TrendSnapshot 记录，供趋势看板展示
            saveSerpTrendSnapshot(serpKeyword, serpTrendScore, tenantId);
            log.info("[TrendAnalysis] SerpApi 趋势分获取成功 keyword={} score={}", serpKeyword, serpTrendScore);
        }

        // ② 获取近期趋势摘要（含刚写入的 SerpApi 快照）
        List<TrendSnapshot> recentTrends = snapshotService.list(
                new LambdaQueryWrapper<TrendSnapshot>()
                        .eq(TrendSnapshot::getTenantId, tenantId)
                        .ge(TrendSnapshot::getSnapshotDate, LocalDate.now().minusDays(30))
                        .orderByDesc(TrendSnapshot::getHeatScore)
                        .last("LIMIT 10"));

        String trendContext = recentTrends.stream()
                .map(t -> t.getKeyword() + "(热度:" + t.getHeatScore() + ")")
                .collect(Collectors.joining(", "));
        if (trendContext.isEmpty()) trendContext = "暂无最新趋势数据，请基于通用服装行业2026年趋势判断";

        String styleDesc = String.format(
                "款式名：%s，品类：%s，颜色系：%s，面料：%s，预计报价：%s元，风格标签：%s",
                candidate.getStyleName(),
                candidate.getCategory() != null ? candidate.getCategory() : "未知",
                candidate.getColorFamily() != null ? candidate.getColorFamily() : "未知",
                candidate.getFabricType() != null ? candidate.getFabricType() : "未知",
                candidate.getTargetPrice() != null ? candidate.getTargetPrice().toString() : "未定",
                candidate.getStyleTags() != null ? candidate.getStyleTags() : "无");

        String prompt = "你是一名专业的服装买手，请对以下候选款式进行趋势契合度评分。\n\n"
                + "当前趋势热词: " + trendContext + serpTrendContext + "\n\n"
                + "候选款信息: " + styleDesc + "\n\n"
                + "请从以下4个维度打分(每项0-100)，并给出总分和建议：\n"
                + "1. 趋势契合度（与当前流行方向的契合程度）\n"
                + "2. 市场竞争力（在OEM/ODM市场的潜力）\n"
                + "3. 生产可行性（工艺难度与稳定性）\n"
                + "4. 客户接受度（买家/终端消费者接受程度）\n\n"
                + "请以JSON格式返回：{\"trend\":85,\"market\":78,\"craft\":90,\"acceptance\":82,\"total\":84,\"suggestion\":\"建议意见\"}";

        Map<String, Object> result = new HashMap<>();
        result.put("candidateId", candidateId);
        result.put("candidateNo", candidate.getCandidateNo());
        // 将 SerpApi 趋势分透传给前端
        if (serpTrendScore >= 0) {
            result.put("serpTrendScore", serpTrendScore);
            result.put("serpKeyword", serpKeyword);
        }

        if (inferenceOrchestrator == null || !inferenceOrchestrator.isAnyModelEnabled()) {
            // AI未配置时：优先用 SerpApi 真实分数，否则基于规则
            int baseScore;
            String reason;
            if (serpTrendScore >= 0) {
                baseScore = serpTrendScore;
                // 利润率和数量加成（最多+10）
                if (candidate.getProfitEstimate() != null && candidate.getProfitEstimate().doubleValue() > 25) baseScore = Math.min(100, baseScore + 5);
                if (candidate.getTargetQty() != null && candidate.getTargetQty() > 100) baseScore = Math.min(100, baseScore + 5);
                reason = "Google Trends 实时热度指数: " + serpTrendScore + "/100";
            } else {
                baseScore = 70;
                if (candidate.getProfitEstimate() != null && candidate.getProfitEstimate().doubleValue() > 25) baseScore += 5;
                if (candidate.getTargetQty() != null && candidate.getTargetQty() > 100) baseScore += 5;
                reason = "AI模型未配置，基于规则评分。利润率和数量综合评估。";
            }
            result.put("score", baseScore);
            result.put("reason", reason);
            result.put("aiEnabled", false);
            candidate.setTrendScore(baseScore);
            candidate.setTrendScoreReason(reason);
            candidateService.updateById(candidate);
            return result;
        }

        try {
            List<AiMessage> messages = new ArrayList<>();
            messages.add(AiMessage.user(prompt));
            var inferResult = inferenceOrchestrator.chat("selection-score", messages, null);
            String content = inferResult.getContent();

            // 尝试解析JSON得到总分
            int totalScore = 75; // 默认分
            String suggestion = content;
            if (content != null && content.contains("\"total\"")) {
                try {
                    com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                    // 提取JSON片段
                    int jsonStart = content.indexOf('{');
                    int jsonEnd = content.lastIndexOf('}');
                    if (jsonStart >= 0 && jsonEnd > jsonStart) {
                        String json = content.substring(jsonStart, jsonEnd + 1);
                        Map<?, ?> parsed = om.readValue(json, Map.class);
                        if (parsed.get("total") instanceof Number) {
                            totalScore = ((Number) parsed.get("total")).intValue();
                        }
                        if (parsed.get("suggestion") != null) {
                            suggestion = parsed.get("suggestion").toString();
                        }
                    }
                } catch (Exception e) {
                    log.warn("[TrendAnalysis] AI分数JSON解析失败，使用原始内容", e);
                }
            }

            result.put("score", totalScore);
            result.put("reason", suggestion);
            result.put("rawContent", content);
            result.put("aiEnabled", true);

            // 回写
            candidate.setTrendScore(totalScore);
            candidate.setTrendScoreReason(suggestion);
            candidateService.updateById(candidate);

        } catch (Exception e) {
            log.error("[TrendAnalysis] AI打分失败", e);
            result.put("score", 70);
            result.put("reason", "AI分析暂时不可用");
            result.put("aiEnabled", false);
        }
        return result;
    }

    // ─────────────── SerpApi 辅助方法 ───────────────

    /**
     * 从候选款信息提取 Google Trends 搜索关键词
     * 优先用 styleName，超长时截取前 15 字；无名称时用 category
     */
    private String buildTrendKeyword(SelectionCandidate candidate) {
        String name = candidate.getStyleName();
        if (name != null && !name.isBlank()) {
            return name.length() > 15 ? name.substring(0, 15) : name;
        }
        return candidate.getCategory() != null ? candidate.getCategory() : "服装";
    }

    /**
     * 将 SerpApi 趋势分保存为 TrendSnapshot 记录，避免重复（同一天同关键词只保存一条）
     */
    private void saveSerpTrendSnapshot(String keyword, int score, Long tenantId) {
        try {
            long existCount = snapshotService.count(
                    new LambdaQueryWrapper<TrendSnapshot>()
                            .eq(TrendSnapshot::getTenantId, tenantId)
                            .eq(TrendSnapshot::getKeyword, keyword)
                            .eq(TrendSnapshot::getDataSource, "SERPAPI")
                            .eq(TrendSnapshot::getSnapshotDate, LocalDate.now()));
            if (existCount > 0) return; // 今日已有记录，无需重复写入

            TrendSnapshot snap = new TrendSnapshot();
            snap.setSnapshotDate(LocalDate.now());
            snap.setDataSource("SERPAPI");
            snap.setTrendType("KEYWORD");
            snap.setKeyword(keyword);
            snap.setHeatScore(score);
            snap.setAiSummary("Google Trends 近3个月热度指数（geo=CN）: " + score + "/100");
            snap.setPeriod("3-month");
            snap.setTenantId(tenantId);
            snapshotService.save(snap);
        } catch (Exception e) {
            log.warn("[TrendAnalysis] 保存 SerpApi 趋势快照失败 keyword={}", keyword, e);
        }
    }

    /**
     * AI基于历史数据生成本季选品建议（整合内部畅销分析）
     */
    public Map<String, Object> generateSelectionSuggestion(Integer year, String season) {
        Long tenantId = UserContext.tenantId();
        Map<String, Object> filters = new HashMap<>();
        filters.put("limit", 20);
        List<StyleHistoryAnalysisDTO> topStyles = approvalOrchestrator.analyzeHistory(filters);

        Map<String, Object> result = new HashMap<>();
        result.put("year", year);
        result.put("season", season);

        if (topStyles.isEmpty()) {
            result.put("suggestion", "暂无历史数据，建议先录入历史生产订单数据后再生成选品建议。");
            return result;
        }

        // 品类分布统计
        Map<String, Long> categoryDist = topStyles.stream()
                .filter(s -> s.getCategory() != null)
                .collect(Collectors.groupingBy(StyleHistoryAnalysisDTO::getCategory, Collectors.counting()));

        // 高潜力款列表
        List<String> highPotentialStyles = topStyles.stream()
                .filter(StyleHistoryAnalysisDTO::getHighPotential)
                .map(s -> s.getStyleNo() + "(" + s.getStyleName() + ")")
                .limit(5).collect(Collectors.toList());

        String historyContext = "历史畅销品类分布: " + categoryDist.toString()
                + "\n高潜力返单款: " + String.join(", ", highPotentialStyles)
                + "\n最高下单量款式: " + topStyles.get(0).getStyleNo()
                + " 共" + topStyles.get(0).getTotalOrderQty() + "件";

        result.put("historyContext", historyContext);
        result.put("categoryDistribution", categoryDist);
        result.put("highPotentialStyles", highPotentialStyles);
        result.put("topStyleCount", topStyles.size());

        if (inferenceOrchestrator != null && inferenceOrchestrator.isAnyModelEnabled()) {
            String prompt = "你是一名专业的服装买手顾问，基于以下历史销售数据，为" + year + "年" + season
                    + "季选品提供策略建议：\n\n" + historyContext
                    + "\n\n请从以下角度给出建议（200字以内）：\n"
                    + "1. 主推品类方向\n2. 避免的品类或款式特征\n3. 建议选款数量和结构\n4. 特别关注点";
            try {
                List<AiMessage> messages = new ArrayList<>();
                messages.add(AiMessage.user(prompt));
                var inferResult = inferenceOrchestrator.chat("selection-strategy", messages, null);
                result.put("aiSuggestion", inferResult.getContent());
                result.put("aiEnabled", true);
            } catch (Exception e) {
                log.error("[TrendAnalysis] 生成选品建议失败", e);
                result.put("aiSuggestion", "AI建议生成失败，请稍后重试");
                result.put("aiEnabled", false);
            }
        } else {
            result.put("aiSuggestion", "基于历史数据：主推品类为 "
                    + (categoryDist.isEmpty() ? "暂无数据" : categoryDist.entrySet().stream()
                    .max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse("—"))
                    + "，建议重点跟进高潜力返单款。");
            result.put("aiEnabled", false);
        }
        return result;
    }

    /** 获取今日热榜（系统级快照，不区分租户，打开页面直接可见） */
    public Map<String, Object> getDailyHotItems() {
        LocalDate today = LocalDate.now();
        List<TrendSnapshot> snapshots = snapshotService.list(
                new LambdaQueryWrapper<TrendSnapshot>()
                        .eq(TrendSnapshot::getTenantId, 0L)
                        .eq(TrendSnapshot::getDataSource, "GOOGLE_SHOPPING")
                        .eq(TrendSnapshot::getTrendType, "DAILY_HOT")
                        .eq(TrendSnapshot::getSnapshotDate, today)
                        .orderByDesc(TrendSnapshot::getHeatScore));

        List<Map<String, Object>> groups = new ArrayList<>();
        for (TrendSnapshot snap : snapshots) {
            try {
                List<Map<String, Object>> items = objectMapper.readValue(
                        snap.getTrendData(), new TypeReference<>() {});
                Map<String, Object> group = new HashMap<>();
                group.put("keyword", snap.getKeyword());
                group.put("heatScore", snap.getHeatScore());
                group.put("products", items);
                groups.add(group);
            } catch (Exception e) {
                log.warn("[DailyHot] 解析 {} 商品数据失败", snap.getKeyword());
            }
        }

        boolean serpReady = serpApiTrendService != null && serpApiTrendService.isReady();
        Map<String, Object> result = new HashMap<>();
        result.put("date", today.toString());
        result.put("cached", !snapshots.isEmpty());
        result.put("serpApiEnabled", serpReady);
        result.put("groups", groups);
        result.put("total", groups.stream().mapToInt(g -> ((List<?>) g.get("products")).size()).sum());
        return result;
    }
}
