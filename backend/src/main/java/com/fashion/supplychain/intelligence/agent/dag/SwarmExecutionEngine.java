package com.fashion.supplychain.intelligence.agent.dag;

import com.fashion.supplychain.intelligence.dto.AgentState;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class SwarmExecutionEngine {

    private final DagExecutionEngine dagExecutionEngine;

    private final ExecutorService swarmExecutor = new ThreadPoolExecutor(
            2, 6, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(16),
            r -> {
                Thread t = new Thread(r, "swarm-" + System.nanoTime());
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    public enum SwarmTopology {
        HIERARCHICAL,
        MESH,
        RING,
        STAR
    }

    public SwarmResult execute(SwarmTopology topology, DagGraph graph, AgentState state) {
        long start = System.currentTimeMillis();
        String graphId = graph.getId();
        log.info("[Swarm] 拓扑={} 图={} 节点数={}", topology, graphId, graph.getNodes().size());

        return switch (topology) {
            case HIERARCHICAL -> executeHierarchical(graph, state, start);
            case MESH -> executeMesh(graph, state, start);
            case RING -> executeRing(graph, state, start);
            case STAR -> executeStar(graph, state, start);
        };
    }

    private SwarmResult executeHierarchical(DagGraph graph, AgentState state, long start) {
        DagExecutionResult dagResult = dagExecutionEngine.execute(graph, state);
        long latency = System.currentTimeMillis() - start;
        return new SwarmResult(
                graph.getId(), SwarmTopology.HIERARCHICAL,
                dagResult.getCompletedNodes(), dagResult.getFailedNodes(),
                dagResult.getNodeResults(), latency, true, null);
    }

    private SwarmResult executeMesh(DagGraph graph, AgentState state, long start) {
        Map<String, Object> nodeResults = new ConcurrentHashMap<>();
        Set<String> completedNodes = ConcurrentHashMap.newKeySet();
        Set<String> failedNodes = ConcurrentHashMap.newKeySet();
        AtomicInteger completedCount = new AtomicInteger(0);
        int totalNodes = graph.getNodes().size();

        List<CompletableFuture<Void>> futures = new ArrayList<>();
        for (DagNode node : graph.allNodes()) {
            futures.add(CompletableFuture.runAsync(() -> {
                try {
                    DagNodeExecutor executor = dagExecutionEngine.getExecutorRegistry().get(node.getId());
                    if (executor == null) {
                        failedNodes.add(node.getId());
                        return;
                    }
                    Object result = executor.execute(state, Map.of(), node.getConfig());
                    nodeResults.put(node.getId(), result);
                    completedNodes.add(node.getId());
                    completedCount.incrementAndGet();
                } catch (Exception e) {
                    failedNodes.add(node.getId());
                    log.warn("[Swarm:Mesh] 节点 {} 失败: {}", node.getId(), e.getMessage());
                }
            }, swarmExecutor));
        }

        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(120, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.error("[Swarm:Mesh] 执行异常: {}", e.getMessage());
        }

        long latency = System.currentTimeMillis() - start;
        return new SwarmResult(graph.getId(), SwarmTopology.MESH,
                completedNodes, failedNodes, nodeResults, latency, true, null);
    }

    private SwarmResult executeRing(DagGraph graph, AgentState state, long start) {
        Map<String, Object> nodeResults = new LinkedHashMap<>();
        Set<String> completedNodes = new LinkedHashSet<>();
        Set<String> failedNodes = new LinkedHashSet<>();

        List<String> order = graph.topologicalOrder();
        Object carryOver = null;

        for (String nodeId : order) {
            DagNode node = graph.getNode(nodeId);
            if (node == null) continue;

            try {
                DagNodeExecutor executor = dagExecutionEngine.getExecutorRegistry().get(nodeId);
                if (executor == null) {
                    failedNodes.add(nodeId);
                    continue;
                }

                Map<String, Object> deps = new HashMap<>();
                if (carryOver != null) {
                    deps.put("_ring_carry", carryOver);
                }
                Object result = executor.execute(state, deps, node.getConfig());
                nodeResults.put(nodeId, result);
                completedNodes.add(nodeId);
                carryOver = result;
            } catch (Exception e) {
                failedNodes.add(nodeId);
                log.warn("[Swarm:Ring] 节点 {} 失败: {}", nodeId, e.getMessage());
                break;
            }
        }

        long latency = System.currentTimeMillis() - start;
        return new SwarmResult(graph.getId(), SwarmTopology.RING,
                completedNodes, failedNodes, nodeResults, latency, true, null);
    }

    private SwarmResult executeStar(DagGraph graph, AgentState state, long start) {
        List<String> order = graph.topologicalOrder();
        if (order.isEmpty()) {
            return new SwarmResult(graph.getId(), SwarmTopology.STAR,
                    Set.of(), Set.of(), Map.of(), System.currentTimeMillis() - start, false, "空图");
        }

        String centerNodeId = order.get(0);
        Map<String, Object> nodeResults = new ConcurrentHashMap<>();
        Set<String> completedNodes = ConcurrentHashMap.newKeySet();
        Set<String> failedNodes = ConcurrentHashMap.newKeySet();

        DagNode centerNode = graph.getNode(centerNodeId);
        if (centerNode == null) {
            return new SwarmResult(graph.getId(), SwarmTopology.STAR,
                    Set.of(), Set.of(), Map.of(), System.currentTimeMillis() - start, false, "中心节点不存在");
        }

        Object centerResult;
        try {
            DagNodeExecutor centerExecutor = dagExecutionEngine.getExecutorRegistry().get(centerNodeId);
            if (centerExecutor == null) {
                return new SwarmResult(graph.getId(), SwarmTopology.STAR,
                        Set.of(), Set.of(centerNodeId), Map.of(),
                        System.currentTimeMillis() - start, false, "中心节点无执行器");
            }
            centerResult = centerExecutor.execute(state, Map.of(), centerNode.getConfig());
            nodeResults.put(centerNodeId, centerResult);
            completedNodes.add(centerNodeId);
        } catch (Exception e) {
            failedNodes.add(centerNodeId);
            return new SwarmResult(graph.getId(), SwarmTopology.STAR,
                    Set.of(), failedNodes, Map.of(),
                    System.currentTimeMillis() - start, false, "中心节点失败: " + e.getMessage());
        }

        List<String> peripheralNodes = order.subList(1, order.size());
        List<CompletableFuture<Void>> futures = new ArrayList<>();

        for (String nodeId : peripheralNodes) {
            DagNode node = graph.getNode(nodeId);
            if (node == null) continue;

            futures.add(CompletableFuture.runAsync(() -> {
                try {
                    DagNodeExecutor executor = dagExecutionEngine.getExecutorRegistry().get(nodeId);
                    if (executor == null) {
                        failedNodes.add(nodeId);
                        return;
                    }
                    Map<String, Object> deps = new HashMap<>();
                    deps.put(centerNodeId, centerResult);
                    Object result = executor.execute(state, deps, node.getConfig());
                    nodeResults.put(nodeId, result);
                    completedNodes.add(nodeId);
                } catch (Exception e) {
                    failedNodes.add(nodeId);
                    log.warn("[Swarm:Star] 外围节点 {} 失败: {}", nodeId, e.getMessage());
                }
            }, swarmExecutor));
        }

        try {
            CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(120, TimeUnit.SECONDS);
        } catch (Exception e) {
            log.error("[Swarm:Star] 外围执行异常: {}", e.getMessage());
        }

        long latency = System.currentTimeMillis() - start;
        return new SwarmResult(graph.getId(), SwarmTopology.STAR,
                completedNodes, failedNodes, nodeResults, latency, true, null);
    }

    public static SwarmTopology selectTopology(String scene) {
        if (scene == null) return SwarmTopology.HIERARCHICAL;
        return switch (scene.toLowerCase()) {
            case "parallel", "mesh", "independent" -> SwarmTopology.MESH;
            case "pipeline", "ring", "sequential" -> SwarmTopology.RING;
            case "dispatch", "star", "fanout" -> SwarmTopology.STAR;
            default -> SwarmTopology.HIERARCHICAL;
        };
    }

    @Data
    public static class SwarmResult {
        private final String graphId;
        private final SwarmTopology topology;
        private final Set<String> completedNodes;
        private final Set<String> failedNodes;
        private final Map<String, Object> nodeResults;
        private final long latencyMs;
        private final boolean success;
        private final String errorMessage;
    }
}
