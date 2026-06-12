package com.fashion.supplychain.intelligence.engine.impl;

import com.fashion.supplychain.intelligence.agent.router.SemanticDomainRouter;
import com.fashion.supplychain.intelligence.engine.ExecutionEngine;
import com.fashion.supplychain.intelligence.engine.dag.DagExecutor;
import com.fashion.supplychain.intelligence.engine.dag.DagExecutionResult;
import com.fashion.supplychain.intelligence.engine.dag.DagGraph;
import com.fashion.supplychain.intelligence.engine.dag.DagNode;
import com.fashion.supplychain.intelligence.engine.dto.ExecutionRequest;
import com.fashion.supplychain.intelligence.engine.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.engine.feature.IntelligenceFeatureFlag;
import com.fashion.supplychain.intelligence.engine.kg.KgRelation;
import com.fashion.supplychain.intelligence.engine.kg.RelationExtractorRegistry;
import com.fashion.supplychain.intelligence.engine.kg.RelationType;
import com.fashion.supplychain.intelligence.helper.PromptContextProvider;
import com.fashion.supplychain.intelligence.prompt.PromptVariantService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@Lazy
public class ExecutionEngineImpl implements ExecutionEngine {

    private final DagExecutor dagExecutor = new DagExecutor();

    @Autowired(required = false)
    private SemanticDomainRouter semanticDomainRouter;

    @Autowired(required = false)
    private RelationExtractorRegistry relationExtractorRegistry;

    @Autowired(required = false)
    private PromptVariantService promptVariantService;

    @Autowired(required = false)
    private PromptContextProvider promptContextProvider;

    @Autowired(required = false)
    private IntelligenceFeatureFlag featureFlag;

    @Override
    public ExecutionResult execute(ExecutionRequest req) {
        Map<String, Object> state = buildInitialState(req);
        DagGraph graph = buildDagFromRequest(req, state);
        DagExecutionResult dagResult = dagExecutor.run(graph, state);
        return toExecutionResult(dagResult);
    }

    @Override
    public ExecutionResult timeTravel(String threadId, int stepIndex) {
        DagExecutionResult dagResult = dagExecutor.timeTravel(threadId, stepIndex);
        return toExecutionResult(dagResult);
    }

    @Override
    public String selectBestPrompt(String intent) {
        if (promptVariantService == null) return "";
        try {
            var variant = promptVariantService.selectVariant(intent);
            if (variant == null) return "";
            return variant.getContent();
        } catch (Exception e) {
            log.warn("[ExecutionEngine] selectBestPrompt failed: {}", e.getMessage());
            return "";
        }
    }

    private Map<String, Object> buildInitialState(ExecutionRequest req) {
        Map<String, Object> state = new HashMap<>();
        state.put("query", req.getQuery());
        state.put("tenantId", req.getTenantId());
        state.put("userId", req.getUserId());
        state.put("sessionId", req.getSessionId());
        state.put("intent", req.getIntent());
        state.put("useNewExecution", shouldUseNewExecution(req.getTenantId()));
        state.put("domainHints", routeDomain(req.getQuery()));
        return state;
    }

    private boolean shouldUseNewExecution(Long tenantId) {
        return featureFlag != null && featureFlag.useNewExecution(tenantId);
    }

    private List<String> routeDomain(String query) {
        if (semanticDomainRouter == null || query == null) return List.of();
        try {
            Object multi = semanticDomainRouter.routeMulti(query, null);
            if (multi == null) return List.of();
            try {
                java.lang.reflect.Method getDomains = multi.getClass().getMethod("getDomains");
                Object domains = getDomains.invoke(multi);
                if (domains instanceof java.util.Collection<?> col) {
                    return col.stream().map(String::valueOf).toList();
                }
            } catch (NoSuchMethodException ignored) {
            }
            return List.of(String.valueOf(multi));
        } catch (Exception e) {
            log.debug("[ExecutionEngine] routeDomain failed: {}", e.getMessage());
            return List.of();
        }
    }

    private DagGraph buildDagFromRequest(ExecutionRequest req, Map<String, Object> state) {
        DagGraph g = new DagGraph();

        g.addNode(new DagNode("validate", "校验参数", s -> {
            Map<String, Object> out = new HashMap<>(s);
            String q = (String) s.get("query");
            if (q == null || q.isBlank()) throw new IllegalArgumentException("query is empty");
            out.put("validated", true);
            return out;
        }));

        g.addNode(new DagNode("recognize_intent", "识别意图", s -> {
            Map<String, Object> out = new HashMap<>(s);
            out.put("intentResult", req.getIntent() != null ? req.getIntent() : "unknown");
            out.put("queryLength", s.get("query") != null ? s.get("query").toString().length() : 0);
            return out;
        }));

        g.addNode(new DagNode("resolve_entities", "解析实体", s -> {
            Map<String, Object> out = new HashMap<>(s);
            String q = (String) s.get("query");
            List<String> entities = extractEntities(q);
            out.put("entities", entities);
            return out;
        }));

        DagNode kgLookup = new DagNode("fetch_data", "数据获取（知识图谱）", s -> {
            Map<String, Object> out = new HashMap<>(s);
            if (relationExtractorRegistry == null) {
                out.put("kgContext", "");
                return out;
            }
            try {
                Long tenantId = (Long) s.get("tenantId");
                if (tenantId == null) {
                    out.put("kgContext", "");
                    return out;
                }
                Map<RelationType, List<KgRelation>> graph = relationExtractorRegistry.extractByRelationTypes(
                        tenantId, List.of(RelationType.PRODUCES, RelationType.BELONGS_TO,
                                RelationType.CONTAINS, RelationType.REQUIRES, RelationType.SUPPLIES));
                StringBuilder sb = new StringBuilder();
                int total = 0;
                for (Map.Entry<RelationType, List<KgRelation>> entry : graph.entrySet()) {
                    sb.append(entry.getKey().name()).append(":").append(entry.getValue().size()).append(";");
                    total += entry.getValue().size();
                }
                out.put("kgContext", sb.toString());
                out.put("kgRelationCount", total);
            } catch (Exception e) {
                out.put("kgContext", "");
                log.debug("[ExecutionEngine] kgLookup failed: {}", e.getMessage());
            }
            return out;
        });
        g.addNode(kgLookup);

        g.addNode(new DagNode("select_prompt", "选择Prompt", s -> {
            Map<String, Object> out = new HashMap<>(s);
            String intent = (String) s.get("intentResult");
            String prompt = selectBestPrompt(intent);
            out.put("selectedPrompt", prompt);
            return out;
        }));

        g.addNode(new DagNode("build_context", "构建上下文", s -> {
            Map<String, Object> out = new HashMap<>(s);
            if (promptContextProvider != null) {
                try {
                    String ctx = promptContextProvider.buildSystemPromptIfChanged(
                            s.get("sessionId") != null ? s.get("sessionId").toString() : "default",
                            (Long) s.get("tenantId"),
                            (Long) s.get("userId"));
                    out.put("contextLength", ctx != null ? ctx.length() : 0);
                } catch (Exception e) {
                    out.put("contextLength", 0);
                }
            }
            return out;
        }));

        g.addNode(new DagNode("compose", "组装回答", s -> {
            Map<String, Object> out = new HashMap<>(s);
            String q = (String) s.get("query");
            String intent = (String) s.get("intentResult");
            String kgContext = (String) s.getOrDefault("kgContext", "");
            String prompt = (String) s.getOrDefault("selectedPrompt", "");
            String answer = String.format(
                    "【%s】针对'%s'的查询结果。基于知识图谱(%s)与工具调用分析，请查看具体执行步骤。",
                    intent, q, kgContext);
            out.put("answer", answer);
            out.put("promptTemplate", prompt);
            return out;
        }));

        g.addEdge("validate", "recognize_intent");
        g.addEdge("recognize_intent", "resolve_entities");
        g.addEdge("resolve_entities", "fetch_data");
        g.addEdge("fetch_data", "select_prompt");
        g.addEdge("select_prompt", "build_context");
        g.addEdge("build_context", "compose");
        g.setExitNode("compose");
        return g;
    }

    private List<String> extractEntities(String query) {
        if (query == null) return List.of();
        List<String> entities = new ArrayList<>();
        String[] tokens = query.split("[\\s,，。；;;、]+");
        for (String token : tokens) {
            if (token.length() >= 2) entities.add(token);
        }
        return entities;
    }

    private ExecutionResult toExecutionResult(DagExecutionResult dag) {
        ExecutionResult r = new ExecutionResult();
        r.setThreadId(dag.getThreadId());
        r.setStepIndex(dag.getStepIndex());
        r.setExecutedNodes(dag.getExecutedNodes());
        r.setState(dag.getFinalState());
        r.setSuccess(dag.isSuccess());
        if (dag.getFinalState() != null && dag.getFinalState().get("answer") != null) {
            r.setAnswer(String.valueOf(dag.getFinalState().get("answer")));
        }
        if (dag.getErrorMessage() != null) r.setErrorMessage(dag.getErrorMessage());
        return r;
    }
}
