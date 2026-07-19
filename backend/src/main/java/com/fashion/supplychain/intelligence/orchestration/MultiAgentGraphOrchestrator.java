package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
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
import org.springframework.context.annotation.Lazy;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import com.fashion.supplychain.intelligence.agent.dag.DagGraph;
import com.fashion.supplychain.intelligence.agent.dag.DagNode;
import com.fashion.supplychain.intelligence.agent.dag.DagNodeExecutor;
import com.fashion.supplychain.intelligence.agent.dag.SwarmExecutionEngine;
import com.fashion.supplychain.intelligence.agent.dag.SwarmExecutionEngine.SwarmTopology;

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
@Lazy
public class MultiAgentGraphOrchestrator {

    private static final int CONFIDENCE_THRESHOLD = 70;
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired private SupervisorAgentOrchestrator supervisor;
    @Autowired private ReflectionEngineOrchestrator reflector;
    @Autowired private DigitalTwinBuilderOrchestrator digitalTwin;
    @Autowired private DecisionChainOrchestrator decisionChain;
    @Autowired private AgentExecutionLogMapper logMapper;
    @Autowired private List<SpecialistAgent> specialistAgents;
    @Autowired private com.fashion.supplychain.intelligence.helper.AiAgentPromptHelper promptHelper;
    @Autowired private AgentCheckpointService checkpointService;
    @Autowired private AgentMemoryService memoryService;
    @Autowired private SwarmExecutionEngine swarmEngine;
    @Autowired private com.fashion.supplychain.intelligence.agent.dag.DagExecutionEngine dagEngine;
    @Autowired(required = false)
    private com.fashion.supplychain.intelligence.service.SharedAgentMemoryService sharedAgentMemory;

    /**
     * 同步执行：Plan→DigitalTwin→Supervisor→Specialist(并行)→Reflect→[重路由]→Result
     */
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
        String threadId = "thread-" + UUID.randomUUID().toString().substring(0, 8);
        state.setThreadId(threadId);
        try {
            emitSse(emitter, "graph_start", Map.of("scene", state.getScene(), "threadId", threadId));

            digitalTwin.buildSnapshot(state);
            checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "digital_twin", "数字孪生", state, 0);
            emitSse(emitter, "node_done", Map.of("node", "digital_twin", "snapshot", state.getDigitalTwinSnapshot() != null ? state.getDigitalTwinSnapshot() : "{}"));

            supervisor.analyzeAndRoute(state);
            state.getNodeTrace().add("supervisor");
            checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "supervisor", "监督路由", state, 1);
            emitSse(emitter, "node_done", Map.of("node", "supervisor", "route", state.getRoute(), "contextSummary", truncate(state.getContextSummary(), 200)));

            dispatchSpecialists(state);
            checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "specialists", "专家分析", state, 2);
            emitSse(emitter, "node_done", Map.of("node", "specialists", "results", state.getSpecialistResults()));

            reflector.critiqueAndReflect(state);
            state.getNodeTrace().add("reflection");
            checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "reflection", "反思引擎", state, 3);
            emitSse(emitter, "node_done", Map.of("node", "reflection", "confidence", state.getConfidenceScore()));

            if (state.getConfidenceScore() < CONFIDENCE_THRESHOLD) {
                supervisor.reRouteWithReflection(state);
                reflector.critiqueAndReflect(state);
                state.getNodeTrace().add("re_route");
                checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "re_route", "重路由", state, 4);
                emitSse(emitter, "node_done", Map.of("node", "re_route", "newRoute", state.getRoute(), "confidence", state.getConfidenceScore()));
            }

            recordDecisionSafely(state);
            checkpointService.markThreadCompleted(state.getTenantId(), threadId);

            long latency = System.currentTimeMillis() - start;
            persistLog(state, "SUCCESS", latency);
            try {
                String summary = String.format("场景=%s 路由=%s 置信=%d 建议=%s",
                    state.getScene(), state.getRoute(), state.getConfidenceScore(),
                    state.getOptimizationSuggestion() != null
                        ? (state.getOptimizationSuggestion().length() > 200
                            ? state.getOptimizationSuggestion().substring(0, 200) : state.getOptimizationSuggestion())
                        : "无");
                promptHelper.updateMasAnalysisCache(summary);
            } catch (Exception e) {
                log.debug("[MultiAgentGraph] 更新MAS分析缓存失败: {}", e.getMessage());
            }
            emitSse(emitter, "graph_done", buildSuccessMap(state, latency));
            emitter.complete();
        } catch (Exception e) {
            long latency = System.currentTimeMillis() - start;
            persistLog(state, "FAILED", latency);
            try { emitSse(emitter, "graph_error", Map.of("error", e.getMessage() != null ? e.getMessage() : "未知错误")); emitter.complete(); }
            catch (Exception e2) { log.debug("[MultiAgentGraph] SSE错误发送失败: {}", e2.getMessage()); emitter.completeWithError(e); }
        }
    }

    // ── 图执行管线 ────────────────────────────────────────────────────────

    private void executeGraphPipeline(AgentState state) {
        String threadId = "thread-" + (state.getExecutionId() != null ? state.getExecutionId() : UUID.randomUUID().toString().substring(0, 8));
        state.setThreadId(threadId);

        digitalTwin.buildSnapshot(state);
        checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "digital_twin", "数字孪生", state, 0);

        supervisor.analyzeAndRoute(state);
        state.getNodeTrace().add("supervisor");
        checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "supervisor", "监督路由", state, 1);

        dispatchSpecialists(state);
        checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "specialists", "专家分析", state, 2);

        reflector.critiqueAndReflect(state);
        state.getNodeTrace().add("reflection");
        checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "reflection", "反思引擎", state, 3);

        if (state.getConfidenceScore() < CONFIDENCE_THRESHOLD) {
            supervisor.reRouteWithReflection(state);
            reflector.critiqueAndReflect(state);
            state.getNodeTrace().add("re_route");
            checkpointService.saveCheckpointAsync(state.getTenantId(), threadId, "re_route", "重路由", state, 4);
        }

        recordDecisionSafely(state);

        memoryService.storeArchival(state.getTenantId(), "graph_mas",
                String.format("route=%s conf=%d suggestion=%s",
                        state.getRoute(), state.getConfidenceScore(),
                        truncate(state.getOptimizationSuggestion(), 200)),
                "decision_lesson");

        checkpointService.markThreadCompleted(state.getTenantId(), threadId);
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
     * <p>【P2升级】多领域时使用 SwarmExecutionEngine 执行，享受 4 种拓扑并行模式：</p>
     * <ul>
     *   <li>单领域 → HIERARCHICAL（顺序执行）</li>
     *   <li>2个领域 → RING（环形流水线，结果依次传递）</li>
     *   <li>3-5个领域 → STAR（中心协调 + 外围并行）</li>
     *   <li>6+个领域 → MESH（全并行）</li>
     * </ul>
     */
    private void dispatchSpecialists(AgentState state) {
        String route = state.getRoute();
        List<SpecialistAgent> targets = specialistAgents.stream()
                .filter(s -> "full".equals(route) || s.getRoute().equals(route))
                .toList();

        if (targets.isEmpty()) {
            log.debug("[Graph] 无匹配的 SpecialistAgent，跳过");
            return;
        }

        // 【P0-3修复】读取共享记忆：注入已有事实，避免Sub-Agent重复查询
        // 原readFacts方法无调用方（断链），现接入到dispatchSpecialists入口
        injectSharedMemoryFacts(state);
        
        if (targets.size() == 1) {
            // 单领域：直接执行，保持原有逻辑
            targets.forEach(s -> { 
                s.analyze(state); 
                state.getNodeTrace().add("specialist:" + s.getRoute()); 
            });
            return;
        }
        
        // ══════════════════════════════════════════════════════════════════════════
        // 【P2升级】多领域：使用 SwarmExecutionEngine 执行
        // ══════════════════════════════════════════════════════════════════════════
        log.info("[Graph:Swarm] 多领域并行执行，拓扑选择，specialists={}", targets.size());
        
        // 1. 构建 DAG 图
        DagGraph graph = new DagGraph("specialist-graph-" + System.currentTimeMillis(), "Specialist并行图");
        List<String> dependencies = new ArrayList<>();
        for (int i = 0; i < targets.size(); i++) {
            SpecialistAgent specialist = targets.get(i);
            DagNode node = new DagNode();
            node.setId("specialist:" + specialist.getRoute());
            node.setName(specialist.getRoute());
            // STAR 拓扑：第一个节点是中心，后续依赖中心
            if (i > 0 && targets.size() >= 3) {
                node.setDependsOn(List.of("specialist:" + targets.get(0).getRoute()));
            }
            graph.addNode(node);
        }
        
        // 2. 注册执行器
        for (SpecialistAgent specialist : targets) {
            String nodeId = "specialist:" + specialist.getRoute();
            dagEngine.registerExecutor(nodeId, new com.fashion.supplychain.intelligence.agent.dag.DagNodeExecutor() {
                @Override
                public String getNodeId() { return nodeId; }
                @Override
                public Object execute(AgentState agentState, Map<String, Object> deps, Map<String, Object> config) {
                    try {
                        specialist.analyze(agentState);
                        return agentState.getSpecialistResults().get(specialist.getRoute());
                    } catch (Exception e) {
                        log.warn("[Graph:Swarm] Specialist {} 失败: {}", specialist.getRoute(), e.getMessage());
                        agentState.getSpecialistResults().put(specialist.getRoute(), "分析失败: " + e.getMessage());
                        return null;
                    }
                }
            });
        }
        
        // 3. 选择拓扑并执行
        SwarmTopology topology = selectSwarmTopology(targets.size());
        log.info("[Graph:Swarm] 执行拓扑={}, specialists={}", topology, targets.size());
        
        SwarmExecutionEngine.SwarmResult swarmResult = swarmEngine.execute(topology, graph, state);
        
        // 4. 记录结果
        for (String completed : swarmResult.getCompletedNodes()) {
            state.getNodeTrace().add(completed);
        }
        if (!swarmResult.getFailedNodes().isEmpty()) {
            log.warn("[Graph:Swarm] 失败的节点: {}", swarmResult.getFailedNodes());
        }
        
        // ══════════════════════════════════════════════════════════════════════════
        // 【P2升级】多Agent共享记忆：执行完成后写入共享事实
        // ══════════════════════════════════════════════════════════════════════════
        writeSharedMemoryFacts(state, targets, swarmResult);
        
        log.info("[Graph:Swarm] 执行完成，成功={}, 失败={}, 耗时={}ms", 
                swarmResult.getCompletedNodes().size(), 
                swarmResult.getFailedNodes().size(),
                swarmResult.getLatencyMs());
    }
    
    /**
     * 根据 specialist 数量选择 Swarm 拓扑。
     */
    private SwarmTopology selectSwarmTopology(int specialistCount) {
        if (specialistCount <= 1) {
            return SwarmTopology.HIERARCHICAL;
        } else if (specialistCount == 2) {
            return SwarmTopology.RING;  // 2领域用环形流水线
        } else if (specialistCount <= 5) {
            return SwarmTopology.STAR;  // 3-5个用星型
        } else {
            return SwarmTopology.MESH;  // 6+个用全并行
        }
    }

    /**
     * 【P0-3修复】注入共享记忆：从同会话已写入的事实中读取，避免 Sub-Agent 重复查询。
     *
     * <p>原 {@link com.fashion.supplychain.intelligence.service.SharedAgentMemoryService#readFacts}
     * 方法无调用方（断链），现接入到 dispatchSpecialists 入口。
     *
     * <p>读取后追加到 state.contextSummary，供 Supervisor 和 Specialist 复用已有事实。
     * 设计意图：扫码 Agent 已发现 order_status=DELAYED 时，质检 Agent 无需重复查询。
     *
     * <p>多租户隔离：readFacts 内部已带 tenant_id WHERE（P0 铁律 4）。
     * 降级安全：SharedAgentMemoryService 不可用或异常时静默跳过，不影响主流程。
     */
    private void injectSharedMemoryFacts(AgentState state) {
        if (sharedAgentMemory == null) {
            log.debug("[Graph:SharedMem] SharedAgentMemoryService 未配置，跳过共享记忆读取");
            return;
        }
        String sessionId = state.getThreadId();
        if (sessionId == null) {
            return;
        }
        try {
            List<com.fashion.supplychain.intelligence.entity.SharedAgentMemory> existingFacts =
                    sharedAgentMemory.readFacts(state.getTenantId(), sessionId);
            if (existingFacts == null || existingFacts.isEmpty()) {
                log.debug("[Graph:SharedMem] 无已存在共享记忆 tenant={} session={}",
                        state.getTenantId(), sessionId);
                return;
            }
            StringBuilder sb = new StringBuilder();
            sb.append("\n[共享记忆：同会话已发现的事实，可复用避免重复查询]\n");
            for (com.fashion.supplychain.intelligence.entity.SharedAgentMemory fact : existingFacts) {
                sb.append(String.format("- %s: %s (来源:%s, 置信度:%s)\n",
                        fact.getFactKey(),
                        truncate(fact.getFactValue() != null ? fact.getFactValue() : "", 200),
                        fact.getAgentName() != null ? fact.getAgentName() : "unknown",
                        fact.getConfidence() != null ? fact.getConfidence() : "N/A"));
            }
            String factsCtx = sb.toString();
            String existingSummary = state.getContextSummary();
            state.setContextSummary((existingSummary == null ? "" : existingSummary) + factsCtx);
            log.info("[Graph:SharedMem] 注入共享记忆 {} 条 tenant={} session={}",
                    existingFacts.size(), state.getTenantId(), sessionId);
        } catch (Exception e) {
            log.debug("[Graph:SharedMem] 读取共享记忆失败（不影响主流程）: {}", e.getMessage());
        }
    }
    
    /**
     * 【P2升级】写入多Agent共享记忆。
     * <p>每个 SpecialistAgent 执行完成后，将分析结果写入共享记忆，供后续Agent复用。</p>
     */
    private void writeSharedMemoryFacts(AgentState state, List<SpecialistAgent> targets, 
                                        SwarmExecutionEngine.SwarmResult swarmResult) {
        if (sharedAgentMemory == null) {
            log.debug("[Graph:SharedMem] SharedAgentMemoryService 未配置，跳过共享记忆写入");
            return;
        }
        
        String sessionId = state.getThreadId() != null ? state.getThreadId() : "graph-" + System.currentTimeMillis();
        state.setThreadId(sessionId);  // 确保 threadId 已设置
        
        for (SpecialistAgent specialist : targets) {
            String nodeId = "specialist:" + specialist.getRoute();
            if (!swarmResult.getCompletedNodes().contains(nodeId)) {
                continue;  // 跳过失败的节点
            }
            
            try {
                // 获取该 Specialist 的分析结果
                Object result = state.getSpecialistResults().get(specialist.getRoute());
                if (result != null) {
                    // 写入共享记忆：key = "specialist:{route}_result"
                    String factKey = "specialist:" + specialist.getRoute() + "_result";
                    String factValue = result.toString();
                    // 置信度 = state.getConfidenceScore() / 100.0
                    java.math.BigDecimal confidence = java.math.BigDecimal.valueOf(state.getConfidenceScore())
                            .divide(java.math.BigDecimal.valueOf(100.0), 2, java.math.RoundingMode.HALF_UP);
                    
                    sharedAgentMemory.writeFact(state.getTenantId(), sessionId, specialist.getRoute(),
                            factKey, factValue, confidence);
                    
                    log.debug("[Graph:SharedMem] 写入共享记忆 tenant={} session={} agent={} key={}",
                            state.getTenantId(), sessionId, specialist.getRoute(), factKey);
                }
            } catch (Exception e) {
                log.warn("[Graph:SharedMem] 写入共享记忆失败 agent={}: {}", specialist.getRoute(), e.getMessage());
            }
        }
        
        // 写入总体置信度
        if (state.getConfidenceScore() > 0) {
            try {
                java.math.BigDecimal confidence = java.math.BigDecimal.valueOf(state.getConfidenceScore())
                        .divide(java.math.BigDecimal.valueOf(100.0), 2, java.math.RoundingMode.HALF_UP);
                sharedAgentMemory.writeFact(state.getTenantId(), sessionId, "graph_orchestrator",
                        "overall_confidence", String.valueOf(state.getConfidenceScore()), confidence);
            } catch (Exception e) {
                log.debug("[Graph:SharedMem] 写入总体置信度失败: {}", e.getMessage());
            }
        }
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

    // ========== 委托查询方法（供 Controller 使用，避免 Controller 直接注入 Mapper） ==========

    public List<AgentExecutionLog> listExecutionLogs(LambdaQueryWrapper<AgentExecutionLog> query) {
        return logMapper.selectList(query);
    }

    public int updateExecutionLog(LambdaUpdateWrapper<AgentExecutionLog> updateWrapper) {
        return logMapper.update(null, updateWrapper);
    }

    public List<Map<String, Object>> getAbStatsByScene(Long tenantId, int days) {
        return logMapper.selectAbStatsByScene(tenantId, days);
    }
}
