package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.specialist.SpecialistAgent;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.production.orchestration.OrderHealthScoreOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 监督代理编排器 — Hybrid Graph MAS 第一节点（Route + Analyze）。
 *
 * <p>职责：<br>
 * 1. 根据场景和 AgentState 用 LLM 决定最优路由（Specialist 选择）<br>
 * 2. 执行初步分析，填充 contextSummary<br>
 * 3. 反思后重路由（低置信时由 MultiAgentGraphOrchestrator 调用）</p>
 *
 * <p>Phase 2 扩展：并行调度 ForecastAgent / SourcingRiskAgent / LogisticsAgent / ComplianceAgent</p>
 */
@Slf4j
@Service
public class SupervisorAgentOrchestrator {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final List<String> VALID_ROUTES =
        Arrays.asList("delivery_risk", "sourcing", "compliance", "logistics", "full");

    private static final String ROUTE_SYS_PROMPT =
        "你是服装供应链AI监督专家。根据订单状态和用户场景，决定最优分析路由。" +
        "请输出JSON：{\"route\":\"...\",\"reason\":\"...\"}。" +
        "路由选项：delivery_risk=货期风险, sourcing=采购供应商, compliance=合规DPP, logistics=物流碳排, full=全面分析。";

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Autowired
    private OrderHealthScoreOrchestrator healthScoreOrchestrator;

    @Autowired
    private QdrantService qdrantService;

    @Autowired
    private List<SpecialistAgent> specialistAgents;

    /**
     * 分析 AgentState，决定路由，执行初步分析，填充 contextSummary & 风险指标。
     */
    public AgentState analyzeAndRoute(AgentState state) {
        String route = decideRoute(state);
        state.setRoute(route);
        state.setContextSummary(executeAnalysis(state, route));
        fillDefaultMetrics(state);
        log.info("[Supervisor] 租户={} 路由={}", state.getTenantId(), route);
        return state;
    }

    /**
     * 重路由：当 confidenceScore < 阈值时由 MultiAgentGraphOrchestrator 调用，切换分析视角。
     */
    public AgentState reRouteWithReflection(AgentState state) {
        String altRoute = pickAlternativeRoute(state.getRoute());
        state.setRoute(altRoute);
        state.setContextSummary(executeAnalysis(state, altRoute));
        log.info("[Supervisor] 重路由 {} → {} 租户={}", state.getRoute(), altRoute, state.getTenantId());
        return state;
    }

    // ── private helpers ────────────────────────────────────────────────────

    private String decideRoute(AgentState state) {
        String scene = state.getScene() != null ? state.getScene() : "full";
        // 用户明确指定非 full 场景时直接用，无需 LLM 路由
        if (VALID_ROUTES.contains(scene) && !"full".equals(scene)) return scene;
        try {
            String msg = String.format("订单数=%d 场景=%s 问题=%s",
                state.getOrderIds() == null ? 0 : state.getOrderIds().size(),
                scene, state.getContextSummary());
            var result = inferenceOrchestrator.chat("supervisor-route", ROUTE_SYS_PROMPT, msg);
            if (result.isSuccess()) {
                String r = JSON.readTree(result.getContent()).path("route").asText("");
                if (VALID_ROUTES.contains(r)) return r;
            }
        } catch (Exception e) {
            log.warn("[Supervisor] 路由LLM失败，使用默认delivery_risk: {}", e.getMessage());
        }
        return "delivery_risk";
    }

    private String executeAnalysis(AgentState state, String route) {
        String sysPrompt = buildAnalysisPrompt(route);
        String userMsg = String.format("共%d个订单。%s",
            state.getOrderIds() == null ? 0 : state.getOrderIds().size(),
            state.getContextSummary() == null ? "" : state.getContextSummary());
        try {
            var result = inferenceOrchestrator.chat("supervisor-analysis", sysPrompt, userMsg);
            if (result.isSuccess()) return result.getContent();
        } catch (Exception e) {
            log.warn("[Supervisor] 分析LLM失败: {}", e.getMessage());
        }
        return "系统正在分析中，路由=" + route + "，请稍后刷新查看结果";
    }

    private String buildAnalysisPrompt(String route) {
        return switch (route) {
            case "delivery_risk" ->
                "你是货期风险分析专家。分析订单货期风险，输出：高风险占比、平均剩余天数、最紧急建议。100字以内。";
            case "sourcing" ->
                "你是采购风险分析专家。分析原材料供应风险，输出：缺料风险等级、备货建议。100字以内。";
            case "compliance" ->
                "你是DPP合规分析专家。分析订单合规状态，输出：风险点、整改优先级。100字以内。";
            case "logistics" ->
                "你是物流优化专家。分析运输路线，输出：可优化节点、碳排降低方案。100字以内。";
            default ->
                "你是供应链全面分析专家。从货期、采购、合规三个维度综合评估，输出核心建议。150字以内。";
        };
    }

    private void fillDefaultMetrics(AgentState state) {
        // 真实指标：通过 OrderHealthScoreOrchestrator 获取
        try {
            if (state.getOrderIds() != null && !state.getOrderIds().isEmpty()) {
                List<Map<String, Object>> scores = healthScoreOrchestrator.batchScores(state.getOrderIds());
                double avgScore = scores.stream()
                        .mapToInt(m -> (int) m.getOrDefault("score", 50))
                        .average().orElse(50);
                state.setRiskScore(100 - avgScore);
                state.setProgressRate(avgScore);
            }
        } catch (Exception e) {
            log.warn("[Supervisor] 真实指标获取失败，使用默认值: {}", e.getMessage());
        }
        // RAG 知识匹配度
        try {
            String query = state.getContextSummary() != null ? state.getContextSummary() : state.getScene();
            if (query != null && !query.isBlank()) {
                var hits = qdrantService.search(state.getTenantId(), query, 3);
                double maxScore = hits.stream().mapToDouble(h -> h.getScore()).max().orElse(0);
                state.setKnowledgeMatch(Math.min(100, maxScore * 100));
            }
        } catch (Exception e) {
            log.debug("[Supervisor] RAG 匹配失败: {}", e.getMessage());
        }
        // 兜底默认值
        if (state.getProgressRate() <= 0) state.setProgressRate(50.0);
        if (state.getRiskScore() <= 0) state.setRiskScore("delivery_risk".equals(state.getRoute()) ? 65.0 : 40.0);
        if (state.getKnowledgeMatch() <= 0) state.setKnowledgeMatch(70.0);
    }

    /**
     * 派发给对应的 SpecialistAgent 执行深度分析
     */
    public AgentState dispatchSpecialist(AgentState state) {
        String route = state.getRoute();
        for (SpecialistAgent specialist : specialistAgents) {
            if (specialist.getRoute().equals(route) || "full".equals(route)) {
                specialist.analyze(state);
                state.getNodeTrace().add("specialist:" + specialist.getRoute());
            }
        }
        return state;
    }

    private String pickAlternativeRoute(String current) {
        return switch (current == null ? "" : current) {
            case "delivery_risk" -> "full";
            case "sourcing"      -> "delivery_risk";
            case "compliance"    -> "sourcing";
            case "logistics"     -> "compliance";
            default              -> "delivery_risk";
        };
    }
}
