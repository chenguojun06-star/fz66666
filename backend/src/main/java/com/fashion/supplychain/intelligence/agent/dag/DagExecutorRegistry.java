package com.fashion.supplychain.intelligence.agent.dag;

import com.fashion.supplychain.intelligence.dto.AgentState;
import com.fashion.supplychain.intelligence.orchestration.DigitalTwinBuilderOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.SupervisorAgentOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.ReflectionEngineOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.DecisionChainOrchestrator;
import com.fashion.supplychain.intelligence.orchestration.specialist.SpecialistAgent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;

import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Map;

@Slf4j
@Configuration
public class DagExecutorRegistry {

    @Autowired
    private DagExecutionEngine engine;
    @Autowired
    private DigitalTwinBuilderOrchestrator digitalTwin;
    @Autowired
    private SupervisorAgentOrchestrator supervisor;
    @Autowired
    private ReflectionEngineOrchestrator reflector;
    @Autowired(required = false)
    private DecisionChainOrchestrator decisionChain;
    @Autowired(required = false)
    private List<SpecialistAgent> specialistAgents;

    @PostConstruct
    public void registerAll() {
        engine.registerExecutor("digital_twin", new DagNodeExecutor() {
            @Override public String getNodeId() { return "digital_twin"; }
            @Override public Object execute(AgentState state, Map<String, Object> deps, Map<String, Object> config) {
                digitalTwin.buildSnapshot(state);
                return Map.of("snapshot", state.getDigitalTwinSnapshot() != null ? state.getDigitalTwinSnapshot() : "{}");
            }
        });

        engine.registerExecutor("supervisor", new DagNodeExecutor() {
            @Override public String getNodeId() { return "supervisor"; }
            @Override public Object execute(AgentState state, Map<String, Object> deps, Map<String, Object> config) {
                supervisor.analyzeAndRoute(state);
                return Map.of("route", state.getRoute() != null ? state.getRoute() : "unknown",
                        "contextSummary", state.getContextSummary() != null ? state.getContextSummary() : "");
            }
        });

        engine.registerExecutor("reflection", new DagNodeExecutor() {
            @Override public String getNodeId() { return "reflection"; }
            @Override public Object execute(AgentState state, Map<String, Object> deps, Map<String, Object> config) {
                reflector.critiqueAndReflect(state);
                return Map.of("confidence", state.getConfidenceScore(),
                        "suggestion", state.getOptimizationSuggestion() != null ? state.getOptimizationSuggestion() : "");
            }
        });

        engine.registerExecutor("decision", new DagNodeExecutor() {
            @Override public String getNodeId() { return "decision"; }
            @Override public Object execute(AgentState state, Map<String, Object> deps, Map<String, Object> config) {
                if (decisionChain != null) {
                    String decision = state.getContextSummary();
                    String rationale = state.getOptimizationSuggestion();
                    decisionChain.recordDecision(state,
                            decision != null ? truncate(decision, 500) : "MAS决策",
                            rationale != null ? truncate(rationale, 500) : "反思建议");
                }
                return Map.of("status", "recorded");
            }
        });

        if (specialistAgents != null) {
            for (SpecialistAgent agent : specialistAgents) {
                String route = agent.getRoute();
                String nodeId = route + "_specialist";
                engine.registerExecutor(nodeId, new DagNodeExecutor() {
                    @Override public String getNodeId() { return nodeId; }
                    @Override public Object execute(AgentState state, Map<String, Object> deps, Map<String, Object> config) {
                        return agent.analyze(state);
                    }
                });
                log.info("[DAG] 注册专家执行器: {}", nodeId);
            }
        }

        log.info("[DAG] 执行器注册完成: {} 个", engine.getExecutorRegistry().size());
    }

    private String truncate(String s, int max) {
        return s != null && s.length() > max ? s.substring(0, max) : s;
    }
}
