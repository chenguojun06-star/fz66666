package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.dto.GraphExecutionResult;
import com.fashion.supplychain.intelligence.dto.MultiAgentRequest;
import com.fashion.supplychain.intelligence.entity.AgentExecutionLog;
import com.fashion.supplychain.intelligence.mapper.AgentExecutionLogMapper;
import com.fashion.supplychain.intelligence.orchestration.specialist.SpecialistAgent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;

/**
 * 多代理图总指挥编排器 — Hybrid Graph MAS v4.1。
 *
 * <p>v4.1 升级：<br>
 * - 4 个 SpecialistAgent 并行执行（full 场景）<br>
 * - DigitalTwin 快照注入<br>
 * - 执行日志持久化（t_agent_execution_log）<br>
 * - SSE 流式推送（runGraphStreaming）<br>
 * - 节点轨迹记录（nodeTrace）</p>
 */
@Slf4j
@Service
public class MultiAgentGraphOrchestrator {

    private static final int CONFIDENCE_THRESHOLD = 70;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private SupervisorAgentOrchestrator supervisor;
    @Autowired private ReflectionEngineOrchestrator reflector;
    @Autowired private DigitalTwinBuilderOrchestrator digitalTwin;
    @Autowired private DecisionChainOrchestrator decisionChain;
    @Autowired private AgentExecutionLogMapper logMapper;
    @Autowired private ModelRoutingConfig modelRoutingConfig;
    @Autowired private List<SpecialistAgent> specialistAgents;

    /**
     * 同步执行：Plan→DigitalTwin→Supervisor→Specialist(并行)→Reflect→[重路由]→Result
     */
    @Transactional(rollbackFor = Exception.class)
    public GraphExecutionResult runGraph(MultiAgentRequest req) {
        long start = System.currentTimeMillis();
        AgentState state = initState(req);
        log.info("[Graph] 启动 租户={} 场景={}", state.getTenantId(), state.getScene());
        try {
            executeGraphPipeline(state);
            long latency = System.currentTimeMillis() - start;
            persistLog(state, "SUCCESS", latency);
            return buildSuccess(state, latency);
        } catch (Exception e) {
            long latency = System.currentTimeMillis() - start;
            persistLog(state, "FAILED", latency);
            log.error("[Graph] 执行失败: {}", e.getMessage(), e);
            return buildError(e.getMessage(), latency);
        }
    }

    /**
     * SSE 流式执行：每个节点完成后推送事件到前端。
     */
    public void runGraphStreaming(MultiAgentRequest req, SseEmitter emitter) {
        long start = System.currentTimeMillis();
        AgentState state = initState(req);
        try {
            emitSse(emitter, "graph_start", Map.of("scene", state.getScene()));

            // Step 1: 数字孪生
            digitalTwin.buildSnapshot(state);
            emitSse(emitter, "node_done", Map.of("node", "digital_twin", "snapshot", state.getDigitalTwinSnapshot() != null ? state.getDigitalTwinSnapshot() : "{}"));

            // Step 2: Supervisor 路由
            supervisor.analyzeAndRoute(state);
            state.getNodeTrace().add("supervisor");
            emitSse(emitter, "node_done", Map.of("node", "supervisor", "route", state.getRoute(), "contextSummary", truncate(state.getContextSummary(), 200)));

            // Step 3: Specialist(s)
            dispatchSpecialists(state);
            emitSse(emitter, "node_done", Map.of("node", "specialists", "results", state.getSpecialistResults()));

            // Step 4: Reflection
            reflector.critiqueAndReflect(state);
            state.getNodeTrace().add("reflection");
            emitSse(emitter, "node_done", Map.of("node", "reflection", "confidence", state.getConfidenceScore()));

            // Step 5: 重路由（如需）
            if (state.getConfidenceScore() < CONFIDENCE_THRESHOLD) {
                supervisor.reRouteWithReflection(state);
                reflector.critiqueAndReflect(state);
                state.getNodeTrace().add("re_route");
                emitSse(emitter, "node_done", Map.of("node", "re_route", "newRoute", state.getRoute(), "confidence", state.getConfidenceScore()));
            }

            // Step 6: 决策闭环
            recordDecisionSafely(state);

            long latency = System.currentTimeMillis() - start;
            persistLog(state, "SUCCESS", latency);
            emitSse(emitter, "graph_done", buildSuccessMap(state, latency));
            emitter.complete();
        } catch (Exception e) {
            long latency = System.currentTimeMillis() - start;
            persistLog(state, "FAILED", latency);
            try { emitSse(emitter, "graph_error", Map.of("error", e.getMessage() != null ? e.getMessage() : "未知错误")); emitter.complete(); }
            catch (Exception ignored) { emitter.completeWithError(e); }
        }
    }

    // ── 图执行管线 ────────────────────────────────────────────────────────

    private void executeGraphPipeline(AgentState state) {
        digitalTwin.buildSnapshot(state);
        supervisor.analyzeAndRoute(state);
        state.getNodeTrace().add("supervisor");
        dispatchSpecialists(state);
        reflector.critiqueAndReflect(state);
        state.getNodeTrace().add("reflection");
        if (state.getConfidenceScore() < CONFIDENCE_THRESHOLD) {
            supervisor.reRouteWithReflection(state);
            reflector.critiqueAndReflect(state);
            state.getNodeTrace().add("re_route");
        }
        // ★ 决策闭环：自动记录本次决策
        recordDecisionSafely(state);
    }

    /**
     * 安全记录决策（降级忽略失败，不影响主流程）。
     */
    private void recordDecisionSafely(AgentState state) {
        try {
            String decision = state.getContextSummary();
            String rationale = state.getOptimizationSuggestion();
            decisionChain.recordDecision(state,
                    decision != null ? truncate(decision, 500) : "MAS决策",
                    rationale != null ? truncate(rationale, 500) : "反思建议");
            state.getNodeTrace().add("decision_record");
        } catch (Exception e) {
            log.warn("[Graph] 决策记录降级: {}", e.getMessage());
        }
    }

    /**
     * 并行派发 SpecialistAgent（full 场景全部执行，其他场景仅匹配路由）。
     */
    private void dispatchSpecialists(AgentState state) {
        String route = state.getRoute();
        List<SpecialistAgent> targets = specialistAgents.stream()
                .filter(s -> "full".equals(route) || s.getRoute().equals(route))
                .toList();
        if (targets.size() <= 1) {
            targets.forEach(s -> { s.analyze(state); state.getNodeTrace().add("specialist:" + s.getRoute()); });
            return;
        }
        // 并行执行多个 Specialist
        List<CompletableFuture<Void>> futures = targets.stream()
                .map(s -> CompletableFuture.runAsync(UserContext.wrap(() -> {
                    try { s.analyze(state); } catch (Exception e) {
                        log.warn("[Graph] Specialist {} 失败: {}", s.getRoute(), e.getMessage());
                        state.getSpecialistResults().put(s.getRoute(), "分析失败: " + e.getMessage());
                    }
                }))).toList();
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
        targets.forEach(s -> state.getNodeTrace().add("specialist:" + s.getRoute()));
    }

    // ── 日志持久化 ────────────────────────────────────────────────────────

    private void persistLog(AgentState state, String status, long latencyMs) {
        try {
            AgentExecutionLog logEntry = AgentExecutionLog.builder()
                    .tenantId(state.getTenantId())
                    .scene(state.getScene())
                    .route(state.getRoute())
                    .contextSummary(truncate(state.getContextSummary(), 2000))
                    .reflection(truncate(state.getReflection(), 2000))
                    .optimizationSuggestion(truncate(state.getOptimizationSuggestion(), 1000))
                    .confidenceScore(state.getConfidenceScore())
                    .status(status)
                    .latencyMs(latencyMs)
                    .specialistResults(toJson(state.getSpecialistResults()))
                    .nodeTrace(toJson(state.getNodeTrace()))
                    .digitalTwinSnapshot(truncate(state.getDigitalTwinSnapshot(), 4000))
                    .createTime(LocalDateTime.now())
                    .build();
            logMapper.insert(logEntry);
            state.setExecutionId(logEntry.getId());
        } catch (Exception e) {
            log.warn("[Graph] 日志持久化失败: {}", e.getMessage());
        }
    }

    // ── 初始化 & 构建结果 ──────────────────────────────────────────────────

    private AgentState initState(MultiAgentRequest req) {
        AgentState state = new AgentState();
        state.setTenantId(UserContext.tenantId());
        state.setScene(req.getScene() != null ? req.getScene() : "full");
        state.setOrderIds(req.getOrderIds() != null ? req.getOrderIds() : new ArrayList<>());
        state.setQuestion(req.getQuestion());
        state.setContextSummary(req.getQuestion() != null ? req.getQuestion() : "");
        return state;
    }

    private GraphExecutionResult buildSuccess(AgentState s, long latencyMs) {
        GraphExecutionResult r = new GraphExecutionResult();
        r.setRoute(s.getRoute());
        r.setConfidenceScore(s.getConfidenceScore());
        r.setReflection(s.getReflection());
        r.setOptimizationSuggestion(s.getOptimizationSuggestion());
        r.setContextSummary(s.getContextSummary());
        r.setSuccess(true);
        r.setExecutedAt(LocalDateTime.now());
        r.setLatencyMs(latencyMs);
        r.setSpecialistResults(s.getSpecialistResults());
        r.setNodeTrace(s.getNodeTrace());
        r.setExecutionId(s.getExecutionId());
        r.setDigitalTwinSnapshot(s.getDigitalTwinSnapshot());
        return r;
    }

    private Map<String, Object> buildSuccessMap(AgentState s, long latencyMs) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("route", s.getRoute()); m.put("confidence", s.getConfidenceScore());
        m.put("contextSummary", s.getContextSummary()); m.put("optimization", s.getOptimizationSuggestion());
        m.put("specialistResults", s.getSpecialistResults()); m.put("nodeTrace", s.getNodeTrace());
        m.put("executionId", s.getExecutionId()); m.put("latencyMs", latencyMs);
        return m;
    }

    private GraphExecutionResult buildError(String msg, long latencyMs) {
        GraphExecutionResult r = new GraphExecutionResult();
        r.setSuccess(false); r.setErrorMessage(msg != null ? msg : "未知错误");
        r.setExecutedAt(LocalDateTime.now()); r.setLatencyMs(latencyMs);
        return r;
    }

    // ── SSE helper ────────────────────────────────────────────────────────

    private void emitSse(SseEmitter emitter, String event, Map<String, Object> data) {
        try { emitter.send(SseEmitter.event().name(event).data(JSON.writeValueAsString(data))); }
        catch (Exception e) { log.debug("[Graph-SSE] 推送失败: {}", e.getMessage()); }
    }

    private String toJson(Object obj) {
        try { return JSON.writeValueAsString(obj); } catch (Exception e) { return "{}"; }
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) + "..." : s;
    }
}
